#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.mjs";
import {
  ensureDirectory,
  loadJsonFile,
  readTextIfExists,
  resolveVaultRoot,
  resolveWithinRoot,
  writeJsonFile,
  writeTextFile
} from "./lib/fs-utils.mjs";
import { renderMarkdown } from "./lib/markdown.mjs";

const VALID_ACTIONS = new Set(["create", "update", "noop"]);

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const plan = await readJsonInput(args.input);
  validatePlan(plan);

  const runtimeDir = resolveWithinRoot(vaultRoot, "state/runtime");
  const ledgerPath = path.join(runtimeDir, "idempotency-keys.json");
  await ensureDirectory(runtimeDir);
  const ledger = await loadJsonFile(ledgerPath, {});

  const result = {
    plan_id: plan.plan_id,
    status: "applied",
    created: [],
    updated: [],
    skipped: [],
    idempotent_hits: []
  };

  for (const action of plan.page_actions || []) {
    await applyPageAction({
      vaultRoot,
      plan,
      action,
      ledger,
      result
    });
  }

  for (const update of plan.index_updates || []) {
    await applyIndexUpdate({
      vaultRoot,
      plan,
      update,
      result
    });
  }

  await writeJsonFile(ledgerPath, ledger);
  writeJsonStdout(result, args.pretty);
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("Mutation plan must be a JSON object");
  }

  if (typeof plan.plan_id !== "string" || !plan.plan_id.trim()) {
    throw new Error("Mutation plan requires a non-empty plan_id");
  }

  if (!Array.isArray(plan.page_actions)) {
    throw new Error("Mutation plan requires page_actions[]");
  }

  if (!Array.isArray(plan.index_updates || [])) {
    throw new Error("index_updates must be an array when present");
  }
}

function assertValidAction(action) {
  if (!VALID_ACTIONS.has(action.action)) {
    throw new Error(`Unsupported action "${action.action}" for path ${action.path}`);
  }
}

function ledgerHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

async function applyPageAction({ vaultRoot, plan, action, ledger, result }) {
  if (!action || typeof action !== "object") {
    throw new Error("page_actions[] entries must be objects");
  }

  if (typeof action.path !== "string" || !action.path.trim()) {
    throw new Error("Every page action requires a path");
  }

  assertValidAction(action);

  if (action.action === "noop") {
    result.skipped.push(action.path);
    return;
  }

  const absolutePath = resolveWithinRoot(vaultRoot, action.path);
  const existingText = await readTextIfExists(absolutePath);
  const existing = existingText !== null;

  if (action.idempotency_key) {
    const existingLedgerRecord = ledger[action.idempotency_key];
    if (existingLedgerRecord) {
      if (existingLedgerRecord.path !== action.path) {
        throw new Error(
          `Idempotency key collision for ${action.idempotency_key}: ${existingLedgerRecord.path} vs ${action.path}`
        );
      }

      result.idempotent_hits.push(action.idempotency_key);
      result.skipped.push(action.path);
      return;
    }
  }

  if (action.action === "create" && existing) {
    throw new Error(`Refusing to create an already existing file: ${action.path}`);
  }

  if (action.action === "update" && !existing) {
    throw new Error(`Refusing to update a missing file: ${action.path}`);
  }

  const rendered = renderMarkdown(action.path, existingText, action.payload || {}, {
    updatedDate: currentDate(),
    updatedBy: "apply-update.mjs"
  });

  if (existingText !== null && rendered === existingText) {
    if (action.idempotency_key) {
      ledger[action.idempotency_key] = {
        path: action.path,
        plan_id: plan.plan_id,
        hash: ledgerHash(rendered),
        applied_at: new Date().toISOString()
      };
    }

    result.skipped.push(action.path);
    return;
  }

  await writeTextFile(absolutePath, rendered);

  if (action.idempotency_key) {
    ledger[action.idempotency_key] = {
      path: action.path,
      plan_id: plan.plan_id,
      hash: ledgerHash(rendered),
      applied_at: new Date().toISOString()
    };
  }

  if (existing) {
    result.updated.push(action.path);
  } else {
    result.created.push(action.path);
  }
}

async function applyIndexUpdate({ vaultRoot, plan, update, result }) {
  if (!update || typeof update !== "object") {
    throw new Error("index_updates[] entries must be objects");
  }

  if (typeof update.path !== "string" || !update.path.trim()) {
    throw new Error("Every index update requires a path");
  }

  const absolutePath = resolveWithinRoot(vaultRoot, update.path);
  const existingText = await readTextIfExists(absolutePath);
  const exists = existingText !== null;
  const sectionName = typeof update.section === "string" && update.section.trim() ? update.section.trim() : "Entries";
  const entries = Array.isArray(update.entries_to_add) ? update.entries_to_add.filter(Boolean) : [];

  const rendered = renderMarkdown(update.path, existingText, {
    title: exists ? undefined : "Index",
    change_reason: `Index update from ${plan.plan_id}`,
    sections: {
      [sectionName]: entries
    }
  }, {
    updatedDate: currentDate(),
    updatedBy: "apply-update.mjs"
  });

  if (existingText !== null && rendered === existingText) {
    result.skipped.push(update.path);
    return;
  }

  await writeTextFile(absolutePath, rendered);

  if (exists) {
    result.updated.push(update.path);
  } else {
    result.created.push(update.path);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
