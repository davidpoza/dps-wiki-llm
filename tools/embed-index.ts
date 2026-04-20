#!/usr/bin/env node

/**
 * @module embed-index
 *
 * Build or incrementally update the semantic (vector) index for a wiki vault.
 *
 * Role in the pipeline:
 *   Upstream of `semantic-search` and `hybrid-search`.  Must be run at least
 *   once before those tools can return semantic results.  Can be re-run at any
 *   time; only changed documents are re-embedded (see incremental strategy below).
 *
 * Reads:
 *   - All `*.md` files under `<vaultRoot>/<wikiDir>` (recursive).
 *   - `<semanticDir>/manifest.json` (existing index state).
 *
 * Writes:
 *   - `<semanticDir>/notes/<id>.json` — one EmbeddingUnit per indexed note.
 *   - `<semanticDir>/manifest.json` — updated registry with new hashes.
 *
 * Incremental hash-diff strategy:
 *   For each discovered markdown file the tool:
 *     1. Normalises the raw text (strips frontmatter, markup, collapses whitespace).
 *     2. Computes a 16-hex-char SHA-256 fingerprint of the normalised text.
 *     3. Looks up the file's ID in the existing manifest.
 *     4. If the stored hash matches the current hash (and `--rebuild` is not set),
 *        the file is skipped — no model inference, no disk write.
 *     5. Otherwise the text is embedded and the unit + manifest entry are updated.
 *   After processing all files, any manifest entries whose IDs were not seen
 *   during the scan (i.e. the source file was deleted) are pruned from the manifest.
 *   This means the manifest always reflects exactly the set of currently existing,
 *   non-trivial wiki files.
 *
 * Usage:
 *   node dist/tools/embed-index.js [--vault <path>] [--rebuild]
 *
 * --rebuild   Force re-embedding of all documents regardless of cached hash.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot } from "./lib/fs-utils.js";
import { resolvedEmbedModel, SYSTEM_CONFIG } from "./config.js";
import { createLocalTransformersProvider } from "./lib/local-transformers-provider.js";
import {
  loadManifest,
  saveManifest,
  saveEmbeddingUnit,
  normalizeTextForEmbedding,
  hashText,
  type SemanticManifest,
  type EmbeddingUnit
} from "./lib/semantic-index.js";

// ── File discovery ─────────────────────────────────────────────────────────────

/**
 * Recursively collect all `*.md` file paths under `wikiDir`.
 * Silently skips unreadable sub-directories rather than aborting.
 *
 * @param wikiDir - Absolute path to the directory to scan.
 * @returns Array of absolute file paths, in filesystem traversal order.
 */
async function collectWikiPaths(wikiDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryName = String(entry.name);
      const fullPath = path.join(dir, entryName);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entryName.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }

  await walk(wikiDir);
  return results;
}

// ── ID / metadata helpers ─────────────────────────────────────────────────────

/**
 * Derive a stable, vault-relative unit ID for a markdown file.
 *
 * Format: `"<relPath>#note"` — the `#note` fragment reserves the ID namespace
 * for future sub-document granularity (e.g. `"wiki/Foo.md#section-2"`).
 *
 * @param vaultRoot    - Absolute path to the vault root.
 * @param absolutePath - Absolute path to the markdown file.
 * @returns Unit ID string, e.g. `"wiki/Concepts/Foo.md#note"`.
 */
function noteIdFromPath(vaultRoot: string, absolutePath: string): string {
  const rel = path.relative(vaultRoot, absolutePath).replace(/\\/g, "/");
  return `${rel}#note`;
}

/**
 * Extract the `title` value from YAML frontmatter.
 * Returns an empty string if no `title:` field is present.
 *
 * The regex anchors to the start of a line inside the frontmatter block and
 * tolerates optional single/double quotes around the value.
 *
 * @param raw - Raw markdown file content.
 * @returns Trimmed title string, or `""`.
 */
function parseFrontmatterTitle(raw: string): string {
  const match = raw.match(/^---[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : "";
}

/**
 * Extract the `type` value from YAML frontmatter.
 * Returns `"unknown"` if no `type:` field is present.
 *
 * @param raw - Raw markdown file content.
 * @returns Trimmed doc-type string, or `"unknown"`.
 */
function parseFrontmatterDocType(raw: string): string {
  const match = raw.match(/^---[\s\S]*?^type:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : "unknown";
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const forceRebuild = rawArgs.includes("--rebuild");
  // Strip --rebuild before parseArgs sees it (it doesn't know about it)
  const filteredArgv = rawArgs.filter((a) => a !== "--rebuild");

  const args = parseArgs(filteredArgv);
  const log = createLogger("embed-index");
  const vaultRoot = resolveVaultRoot(args.vault);
  const wikiDir = path.join(vaultRoot, SYSTEM_CONFIG.paths.wikiDir);

  log.info(
    {
      phase: "startup",
      vault: vaultRoot,
      wiki_dir: wikiDir,
      rebuild: forceRebuild,
      model: resolvedEmbedModel(),
      min_chars: SYSTEM_CONFIG.semantic.minChars,
      batch_size: SYSTEM_CONFIG.semantic.batchSize
    },
    "embed-index: started"
  );

  const provider = createLocalTransformersProvider();

  // Load the existing manifest so we can diff against it.
  const manifest = await loadManifest(vaultRoot);

  log.info(
    {
      phase: "manifest-loaded",
      existing_entries: Object.keys(manifest.items).length,
      manifest_model: manifest.model,
      manifest_last_rebuild: manifest.last_rebuild_at
    },
    "embed-index: existing manifest loaded"
  );

  const wikiPaths = (await collectWikiPaths(wikiDir)).filter((p) => {
    const rel = path.relative(vaultRoot, p).replace(/\\/g, "/");
    return !rel.startsWith("wiki/projects/");
  });

  log.info(
    { phase: "scan", total: wikiPaths.length, wiki_dir: wikiDir },
    "embed-index: wiki files found"
  );

  let embedded = 0;
  let skipped = 0;
  let removed = 0;

  // Track seen IDs to detect deleted files
  const seenIds = new Set<string>();

  for (const absPath of wikiPaths) {
    const noteId = noteIdFromPath(vaultRoot, absPath);
    seenIds.add(noteId);

    let raw: string;

    try {
      raw = await fs.readFile(absPath, "utf8");
    } catch {
      log.warn({ phase: "read", id: noteId, path: absPath }, "embed-index: could not read file — skipping");
      continue;
    }

    // Step 1: normalise — strip markup so the model sees clean prose.
    const normalized = normalizeTextForEmbedding(raw);

    // Step 2: skip documents that are too short to produce meaningful embeddings.
    if (normalized.length < SYSTEM_CONFIG.semantic.minChars) {
      log.debug(
        { phase: "skip-short", id: noteId, chars: normalized.length, min_chars: SYSTEM_CONFIG.semantic.minChars },
        "embed-index: document too short — skipping"
      );
      skipped++;
      continue;
    }

    // Step 3: compute content fingerprint.
    const hash = hashText(normalized);
    const existing = manifest.items[noteId];

    // Step 4: hash-diff — skip unchanged documents unless a full rebuild is requested.
    if (!forceRebuild && existing?.hash === hash) {
      log.debug(
        { phase: "skip-unchanged", id: noteId, hash },
        "embed-index: content unchanged — skipping"
      );
      skipped++;
      continue;
    }

    const reason = existing ? "content-changed" : "new-document";

    log.info(
      {
        phase: "embed-start",
        id: noteId,
        reason,
        prev_hash: existing?.hash ?? null,
        new_hash: hash,
        normalized_chars: normalized.length,
        text_preview: normalized.slice(0, 120)
      },
      "embed-index: embedding document"
    );

    const embedStart = Date.now();

    // Step 5: embed and persist the unit.
    // The detailed per-inference log is emitted inside local-transformers-provider.
    const [embedding] = await provider.embed([normalized]);

    const embedDuration = Date.now() - embedStart;
    const title = parseFrontmatterTitle(raw) || path.basename(absPath, ".md");
    const docType = parseFrontmatterDocType(raw);

    log.info(
      {
        phase: "embed-done",
        id: noteId,
        title,
        doc_type: docType,
        hash,
        duration_ms: embedDuration,
        vector_dim: embedding.length
      },
      "embed-index: document embedded"
    );

    const unit: EmbeddingUnit = {
      id: noteId,
      kind: "note",
      path: path.relative(vaultRoot, absPath).replace(/\\/g, "/"),
      title,
      doc_type: docType,
      hash,
      embedding,
      // Store a short preview for debugging without needing the original file.
      text_preview: normalized.slice(0, 200)
    };

    const relFile = await saveEmbeddingUnit(vaultRoot, unit);

    log.debug(
      { phase: "unit-saved", id: noteId, file: relFile },
      "embed-index: embedding unit written to disk"
    );

    // Update the manifest entry in memory (written to disk once after the loop).
    manifest.items[noteId] = { file: relFile, hash };
    embedded++;
  }

  // Step 6: prune manifest entries for files that no longer exist on disk.
  // This keeps the manifest honest — stale vectors cannot pollute search results.
  const staleIds: string[] = [];
  for (const id of Object.keys(manifest.items)) {
    if (!seenIds.has(id)) {
      staleIds.push(id);
      delete manifest.items[id];
      removed++;
    }
  }

  if (staleIds.length > 0) {
    log.info(
      { phase: "prune", stale_ids: staleIds },
      "embed-index: pruned stale manifest entries for deleted files"
    );
  }

  const updatedManifest: SemanticManifest = {
    ...manifest,
    model: provider.model,
    dimension: provider.dimension,
    last_rebuild_at: new Date().toISOString()
  };

  await saveManifest(vaultRoot, updatedManifest);

  log.info(
    {
      phase: "done",
      embedded,
      skipped,
      removed,
      total: Object.keys(updatedManifest.items).length,
      model: updatedManifest.model,
      dimension: updatedManifest.dimension,
      manifest_path: `${SYSTEM_CONFIG.paths.semanticDir}/manifest.json`
    },
    "embed-index: completed"
  );

  writeJsonStdout(
    {
      status: "ok",
      model: provider.model,
      dimension: provider.dimension,
      embedded,
      skipped,
      removed,
      total: Object.keys(updatedManifest.items).length,
      manifest_path: `${SYSTEM_CONFIG.paths.semanticDir}/manifest.json`
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
