#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot, writeTextFile } from "./lib/fs-utils.js";
import { loadWikiDocs } from "./lib/wiki-inspect.js";
import { splitFrontmatter, stringifyFrontmatter } from "./lib/frontmatter.js";
import { runToolJson } from "./lib/run-tool.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { WikiDoc } from "./lib/contracts.js";

/**
 * Re-classify wiki notes by outgoing link count:
 *   - concept with > 3 wikiLinks → move to wiki/topics/
 *   - topic   with ≤ 3 wikiLinks → move to wiki/concepts/
 *
 * Usage:
 *   node dist/tools/reclassify-by-links.js [--vault <path>] [--dry-run] [--compact]
 */

const OUTBOUND_THRESHOLD = 3;

interface MovedEntry {
  from: string;
  to: string;
  links: number;
}

interface ReclassifyOutput {
  status: "reclassify_completed";
  dry_run: boolean;
  moved: MovedEntry[];
  reindexed: boolean;
}

function parseReclassifyArgs(argv: string[] = process.argv.slice(2)): {
  vault: string;
  dryRun: boolean;
  pretty: boolean;
} {
  let vault = SYSTEM_CONFIG.cli.defaultVault();
  let dryRun = false;
  let pretty = true;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--vault") {
      vault = argv[++i];
      continue;
    }

    if (token === "--dry-run" || token === "--no-write") {
      dryRun = true;
      continue;
    }

    if (token === "--compact") {
      pretty = false;
      continue;
    }

    if (token === "--pretty") {
      pretty = true;
      continue;
    }

    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  return { vault, dryRun, pretty };
}

/**
 * Update a single frontmatter field in raw markdown content, preserving everything else.
 */
function updateFrontmatterField(raw: string, key: string, value: string): string {
  const { frontmatter, body } = splitFrontmatter(raw);
  const updated = { ...frontmatter, [key]: value, updated: new Date().toISOString() };
  return `${stringifyFrontmatter(updated)}${body}`;
}

/**
 * Move a wiki document to a new type folder, updating its frontmatter in place.
 */
async function moveDoc(
  doc: WikiDoc,
  newType: "concept" | "topic",
  vaultRoot: string,
  dryRun: boolean
): Promise<string> {
  const filename = path.basename(doc.absolutePath);
  const targetFolder = newType === "topic" ? "wiki/topics" : "wiki/concepts";
  const newAbsPath = path.join(vaultRoot, targetFolder, filename);
  const newRelPath = `${targetFolder}/${filename}`;

  if (!dryRun) {
    const updatedContent = updateFrontmatterField(doc.raw, "type", newType);
    await writeTextFile(newAbsPath, updatedContent);
    await fs.unlink(doc.absolutePath);
  }

  return newRelPath;
}

async function main(): Promise<void> {
  const { vault, dryRun, pretty } = parseReclassifyArgs();
  const log = createLogger("reclassify-by-links");
  const vaultRoot = resolveVaultRoot(vault);

  log.info({ dryRun }, "reclassify-by-links started");

  const docs = await loadWikiDocs(vaultRoot);
  const moved: MovedEntry[] = [];

  for (const doc of docs) {
    const linkCount = doc.wikiLinks.length;

    if (doc.docType === "concept" && linkCount > OUTBOUND_THRESHOLD) {
      const toPath = await moveDoc(doc, "topic", vaultRoot, dryRun);
      moved.push({ from: doc.relativePath, to: toPath, links: linkCount });
      log.info({ from: doc.relativePath, to: toPath, links: linkCount }, "concept → topic");
      continue;
    }

    if (doc.docType === "topic" && linkCount <= OUTBOUND_THRESHOLD) {
      const toPath = await moveDoc(doc, "concept", vaultRoot, dryRun);
      moved.push({ from: doc.relativePath, to: toPath, links: linkCount });
      log.info({ from: doc.relativePath, to: toPath, links: linkCount }, "topic → concept");
    }
  }

  let reindexed = false;

  if (moved.length > 0 && !dryRun) {
    log.info({ count: moved.length }, "running reindex after reclassification");
    await runToolJson("reindex", { vault: vaultRoot });
    reindexed = true;
  }

  log.info({ moved: moved.length, reindexed }, "reclassify-by-links completed");

  const output: ReclassifyOutput = {
    status: "reclassify_completed",
    dry_run: dryRun,
    moved,
    reindexed
  };

  writeJsonStdout(output, pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
