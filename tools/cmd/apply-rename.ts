#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs/promises";

import { parseArgs, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { pathExists, readTextIfExists, resolveVaultRoot, writeJsonFile, writeTextFile } from "../lib/storage/fs-utils.js";
import { loadWikiDocs } from "../lib/wiki/wiki-inspect.js";
import { runToolJson } from "../lib/infra/run-tool.js";
import { loadRenamePlan, renamePlanPath } from "./rename-plan.js";

/**
 * Replace [[slug_from|alias]] → [[slug_to|alias]] and [[slug_from]] → [[slug_to]]
 * in a markdown string. Only matches exact slug targets, not substrings.
 */
function replaceWikilinks(content: string, slugFrom: string, slugTo: string): string {
  const escaped = slugFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(
    new RegExp(`\\[\\[${escaped}(\\|[^\\]]+)?\\]\\]`, "g"),
    (_, alias) => `[[${slugTo}${alias ?? ""}]]`
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("apply-rename");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info({ phase: "startup" }, "apply-rename: started");

  const plan = await loadRenamePlan(vaultRoot);
  const pending = plan.entries.filter((e) => e.status === "pending");

  if (pending.length === 0) {
    log.info({ phase: "done" }, "apply-rename: no pending renames");
    writeJsonStdout({ status: "apply_rename_completed", renamed: 0, skipped: 0 });
    return;
  }

  log.info({ phase: "start", pending: pending.length }, "apply-rename: processing pending entries");

  const docs = await loadWikiDocs(vaultRoot);

  let renamed = 0;
  let skipped = 0;

  for (const entry of pending) {
    const fromAbs = path.join(vaultRoot, entry.from);
    const toAbs = path.join(vaultRoot, entry.to);

    const sourceContent = await readTextIfExists(fromAbs);
    if (sourceContent === null) {
      log.warn({ from: entry.from }, "apply-rename: source file not found — skipping");
      entry.status = "skipped";
      skipped++;
      continue;
    }

    if (await pathExists(toAbs)) {
      log.warn({ from: entry.from, to: entry.to }, "apply-rename: target already exists — skipping");
      entry.status = "skipped";
      skipped++;
      continue;
    }

    // 1. Write file at new path
    await writeTextFile(toAbs, sourceContent);

    // 2. Delete old file
    await fs.unlink(fromAbs);

    log.info({ from: entry.from, to: entry.to }, "apply-rename: file moved");

    // 3. Rewrite wikilinks across all docs
    for (const doc of docs) {
      if (doc.relativePath === entry.from) continue;
      const docAbs = path.join(vaultRoot, doc.relativePath);
      const content = await readTextIfExists(docAbs);
      if (!content) continue;

      const updated = replaceWikilinks(content, entry.slug_from, entry.slug_to);
      if (updated !== content) {
        await writeTextFile(docAbs, updated);
        log.info(
          { doc: doc.relativePath, slug_from: entry.slug_from, slug_to: entry.slug_to },
          "apply-rename: wikilinks updated in doc"
        );
      }
    }

    entry.status = "applied";
    renamed++;
  }

  // Delete plan file — all entries processed
  await fs.unlink(renamePlanPath(vaultRoot)).catch(() => {});

  // Reindex FTS
  log.info({ phase: "reindex/fts" }, "apply-rename: reindexing FTS");
  await runToolJson("reindex", { vault: vaultRoot });

  // Reindex semantic (incremental — only changed files)
  log.info({ phase: "reindex/semantic" }, "apply-rename: reindexing semantic index");
  await runToolJson("embed-index", { vault: vaultRoot });

  log.info({ phase: "done", renamed, skipped }, "apply-rename: completed");

  writeJsonStdout({
    status: "apply_rename_completed",
    renamed,
    skipped
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
