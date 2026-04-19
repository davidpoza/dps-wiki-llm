#!/usr/bin/env node

import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { ensureDirectory, loadJsonFile, resolveVaultRoot, writeJsonFile } from "./lib/fs-utils.js";
import { loadWikiDocs } from "./lib/wiki-inspect.js";
import { chatCompletion, chatText } from "./lib/llm.js";
import { SYSTEM_CONFIG } from "./config.js";

export interface RenameEntry {
  from: string;
  to: string;
  slug_from: string;
  slug_to: string;
  reason: "non_ascii" | "spanish_pattern";
  status: "pending" | "applied" | "skipped";
}

export interface RenamePlan {
  generated_at: string;
  entries: RenameEntry[];
}

// Spanish morphological suffixes (ASCII slugs that are likely Spanish)
const SPANISH_SUFFIXES = /(?:cion|sion|idad|dad|miento|amiento|ismo|logia|grafia|emia|osis|asis)$/;
const KEBAB_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NON_ASCII = /[^a-z0-9-]/;

export function renamePlanPath(vaultRoot: string): string {
  return path.join(vaultRoot, SYSTEM_CONFIG.paths.maintenanceDir, "rename-plan.json");
}

export async function loadRenamePlan(vaultRoot: string): Promise<RenamePlan> {
  return loadJsonFile<RenamePlan>(renamePlanPath(vaultRoot), { generated_at: "", entries: [] });
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

async function suggestEnglishSlugs(slugs: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (slugs.length === 0) return result;
  try {
    const list = slugs.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const response = await chatCompletion({
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You will receive a numbered list of kebab-case slugs that may be in a language other than English. " +
            "Translate each one into its English kebab-case equivalent. " +
            "Reply with ONLY a numbered list in the same order, one slug per line, no explanation. " +
            "Use standard English medical/scientific terminology when applicable. " +
            "If a slug is already correct English, repeat it unchanged."
        },
        { role: "user", content: list }
      ]
    });
    const text = chatText(response, "suggestEnglishSlugs");
    const lines = text.trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*(.+)$/);
      if (!match) continue;
      const idx = parseInt(match[1], 10) - 1;
      if (idx < 0 || idx >= slugs.length) continue;
      const normalized = normalizeSlug(match[2]);
      if (normalized) result.set(slugs[idx], normalized);
    }
  } catch {
    // return empty map on error
  }
  return result;
}

export async function generateRenamePlan(
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<{ new_entries: number; total_pending: number }> {
  const docs = await loadWikiDocs(vaultRoot);
  const typedDocTypes = new Set([...SYSTEM_CONFIG.wiki.typedDocTypes, "source"]);

  const existingPlan = await loadRenamePlan(vaultRoot);
  const alreadyPlanned = new Set(existingPlan.entries.map((e) => e.from));

  // Collect all non-compliant docs first
  const candidates: Array<{ doc: typeof docs[number]; slug: string; reason: RenameEntry["reason"] }> = [];

  for (const doc of docs) {
    if (!typedDocTypes.has(doc.docType)) continue;
    if (alreadyPlanned.has(doc.relativePath)) continue;

    const slug = doc.relativePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
    if (!slug) continue;

    let reason: RenameEntry["reason"] | null = null;
    if (NON_ASCII.test(slug)) {
      reason = "non_ascii";
    } else if (KEBAB_PATTERN.test(slug) && SPANISH_SUFFIXES.test(slug)) {
      reason = "spanish_pattern";
    }
    if (!reason) continue;

    log.info({ phase: "detect", slug, reason }, "rename-plan: non-compliant slug detected");
    candidates.push({ doc, slug, reason });
  }

  // Single LLM call for all slugs
  const slugList = candidates.map((c) => c.slug);
  const suggestions = slugList.length > 0 ? await suggestEnglishSlugs(slugList) : new Map<string, string>();

  log.info({ phase: "llm", candidates: slugList.length, suggestions: suggestions.size }, "rename-plan: LLM suggestions received");

  const newEntries: RenameEntry[] = [];

  for (const { doc, slug, reason } of candidates) {
    const suggestedSlug = suggestions.get(slug);

    if (!suggestedSlug || suggestedSlug === slug) {
      log.warn({ slug, suggested: suggestedSlug }, "rename-plan: no valid suggestion — skipping");
      continue;
    }

    const dir = doc.relativePath.substring(0, doc.relativePath.lastIndexOf("/") + 1);
    const entry: RenameEntry = {
      from: doc.relativePath,
      to: `${dir}${suggestedSlug}.md`,
      slug_from: slug,
      slug_to: suggestedSlug,
      reason,
      status: "pending"
    };

    newEntries.push(entry);
    log.info({ from: entry.from, to: entry.to }, "rename-plan: entry added");
  }

  const plan: RenamePlan = {
    generated_at: new Date().toISOString(),
    entries: [...existingPlan.entries, ...newEntries]
  };

  const planPath = renamePlanPath(vaultRoot);
  await ensureDirectory(path.dirname(planPath));
  await writeJsonFile(planPath, plan);

  const totalPending = plan.entries.filter((e) => e.status === "pending").length;
  return { new_entries: newEntries.length, total_pending: totalPending };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("rename-plan");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info({ phase: "startup", vault_root: vaultRoot }, "rename-plan: started");

  const { new_entries, total_pending } = await generateRenamePlan(vaultRoot, log);

  log.info({ phase: "done", new_entries, total_pending }, "rename-plan: completed");

  writeJsonStdout({
    status: "rename_plan_generated",
    new_entries,
    total_pending,
    plan_path: path.relative(vaultRoot, renamePlanPath(vaultRoot))
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
