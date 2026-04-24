#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs/promises";

import { parseArgs, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { resolveVaultRoot, resolveWithinRoot, pathExists } from "../lib/storage/fs-utils.js";
import { manifestPath } from "../lib/storage/semantic-index.js";
import { runToolJson } from "../lib/infra/run-tool.js";
import { slugify } from "../lib/infra/text.js";
import { SYSTEM_CONFIG } from "../config.js";
import type { CommitInput, CommitResult } from "../lib/core/contracts.js";

/**
 * Batch enrich: scans enrich/{concepts,topics,entities,analyses}/ for .md files
 * and processes each one through the full pipeline sequentially.
 * A failure on one file does not abort the rest.
 *
 * Usage:
 *   node dist/tools/enrich-batch.js --vault <path>
 */

interface EnrichLinksOutput {
  status: string;
  updated: string[];
  skipped: string[];
}

interface ProcessedFile {
  src_path: string;
  wiki_path: string;
  enrich_updated: string[];
  commit_sha: string | null;
}

interface FailedFile {
  src_path: string;
  error: string;
}

interface EnrichBatchOutput {
  status: "enrich_batch_completed";
  processed: ProcessedFile[];
  failed: FailedFile[];
  total: number;
  embed_index_result: Record<string, unknown> | null;
}

const ENRICH_SUBDIRS = ["concepts", "topics", "entities", "analyses"] as const;

async function collectEnrichFiles(enrichRoot: string): Promise<string[]> {
  const files: string[] = [];

  for (const subdir of ENRICH_SUBDIRS) {
    const dir = path.join(enrichRoot, subdir);

    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      files.push(path.join(dir, entry));
    }
  }

  return files;
}

async function processFile(
  srcPath: string,
  vaultRoot: string,
  log: ReturnType<typeof createLogger>
): Promise<ProcessedFile> {
  const enrichRoot = resolveWithinRoot(vaultRoot, "enrich");
  const relative = path.relative(enrichRoot, srcPath); // e.g. concepts/foo.md
  const parts = relative.split(path.sep);

  if (parts.length < 2) {
    throw new Error(`Unexpected enrich path structure: ${srcPath}`);
  }

  const subdir = parts[0]; // concepts
  const rawFilename = parts.slice(1).join("/"); // e.g. "My Cool Note.md"
  const ext = path.extname(rawFilename);
  const stem = path.basename(rawFilename, ext);
  const kebabStem = slugify(stem, 80);
  const filename = `${kebabStem}${ext}`;
  const wikiRelativePath = `wiki/${subdir}/${filename}`;
  const wikiAbsPath = resolveWithinRoot(vaultRoot, wikiRelativePath);

  if (stem !== kebabStem) {
    log.info({ original: stem, kebab: kebabStem }, "enrich-batch: filename normalized to kebab-case");
  }

  // 1. copy to wiki
  await fs.mkdir(path.dirname(wikiAbsPath), { recursive: true });
  await fs.copyFile(srcPath, wikiAbsPath);
  log.info({ src: srcPath, dest: wikiAbsPath }, "enrich-batch: copied to wiki");

  // 2. reindex
  await runToolJson("reindex", { vault: vaultRoot });
  log.info({ path: wikiRelativePath }, "enrich-batch: reindexed");

  // 3. enrich-links
  const enrichResult = await runToolJson<EnrichLinksOutput>("enrich-links", {
    vault: vaultRoot,
    args: ["--paths", wikiRelativePath]
  });
  log.info(
    { path: wikiRelativePath, updated: enrichResult.updated.length },
    "enrich-batch: enrich-links done"
  );

  // 4. commit
  const commitInput: CommitInput = {
    operation: "manual",
    summary: `enrich-links: add ${wikiRelativePath}`,
    source_refs: [],
    affected_notes: enrichResult.updated,
    paths_to_stage: [wikiRelativePath, ...enrichResult.updated],
    feedback_record_ref: null,
    mutation_result_ref: null,
    commit_message: `enrich-links: add ${wikiRelativePath}`
  };

  const commitResult = await runToolJson<CommitResult>("commit", {
    vault: vaultRoot,
    input: commitInput
  });
  log.info({ sha: commitResult.commit_sha }, "enrich-batch: committed");

  // 5. delete source file
  await fs.unlink(srcPath);
  log.info({ src: srcPath }, "enrich-batch: source deleted");

  return {
    src_path: srcPath,
    wiki_path: wikiRelativePath,
    enrich_updated: enrichResult.updated,
    commit_sha: commitResult.commit_sha
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("enrich-batch");
  const vaultRoot = resolveVaultRoot(args.vault);
  const enrichRoot = resolveWithinRoot(vaultRoot, "enrich");

  log.info({ vault_root: vaultRoot }, "enrich-batch: started");

  const files = await collectEnrichFiles(enrichRoot);

  if (files.length === 0) {
    log.info("enrich-batch: no files found");
    const output: EnrichBatchOutput = {
      status: "enrich_batch_completed",
      processed: [],
      failed: [],
      total: 0,
      embed_index_result: null
    };
    writeJsonStdout(output, args.pretty);
    return;
  }

  log.info({ count: files.length }, "enrich-batch: files found");

  const processed: ProcessedFile[] = [];
  const failed: FailedFile[] = [];

  for (const srcPath of files) {
    try {
      const result = await processFile(srcPath, vaultRoot, log);
      processed.push(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn({ src: srcPath, error }, "enrich-batch: file failed — continuing");
      failed.push({ src_path: srcPath, error });
    }
  }

  // embed-index incremental (only if semantic index already exists)
  let embedIndexResult: Record<string, unknown> | null = null;
  if (processed.length > 0 && await pathExists(manifestPath(vaultRoot))) {
    log.info({ phase: "embed-index" }, "enrich-batch: updating semantic index");
    embedIndexResult = await runToolJson<Record<string, unknown>>("embed-index", {
      vault: vaultRoot
    });
    log.info(
      { embedded: embedIndexResult.embedded ?? null, skipped: embedIndexResult.skipped ?? null },
      "enrich-batch: semantic index updated"
    );
  }

  log.info(
    { processed: processed.length, failed: failed.length },
    "enrich-batch: completed"
  );

  const output: EnrichBatchOutput = {
    status: "enrich_batch_completed",
    processed,
    failed,
    total: files.length,
    embed_index_result: embedIndexResult
  };

  writeJsonStdout(output, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
