#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.js";
import { loadWikiDocs } from "./lib/wiki-inspect.js";
import { SYSTEM_CONFIG } from "./config.js";
import { createLogger } from "./lib/logger.js";

/**
 * Generate wiki/HOME.md with alphabetical link sections for Topics, Entities, and Concepts.
 * Run automatically after each ingest to keep the index current.
 */

const HOME_PATH = "wiki/HOME.md";

const SECTIONS: Array<{ label: string; docType: string }> = [
  { label: "Topics", docType: "topic" },
  { label: "Entities", docType: "entity" },
  { label: "Concepts", docType: "concept" }
];

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("gen-home");
  const vaultRoot = resolveVaultRoot(args.vault);
  const homePath = resolveWithinRoot(vaultRoot, HOME_PATH);

  log.info("gen-home started");

  const docs = await loadWikiDocs(vaultRoot);
  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    `---`,
    `title: Home`,
    `type: index`,
    `updated: ${today}`,
    `---`,
    ``,
    `# Home`,
    ``
  ];

  let total = 0;

  for (const { label, docType } of SECTIONS) {
    const matches = docs
      .filter((d) => d.docType === docType)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

    lines.push(`## ${label}`, ``);

    if (matches.length === 0) {
      lines.push(`_No ${label.toLowerCase()} yet._`, ``);
      continue;
    }

    for (const doc of matches) {
      const relToHome = path.posix.relative(
        path.posix.dirname(
          doc.relativePath.startsWith("wiki/") ? HOME_PATH : `wiki/${HOME_PATH}`
        ),
        doc.relativePath.replace(/\\/g, "/")
      );
      lines.push(`- [${doc.title}](${relToHome})`);
    }

    lines.push(``);
    total += matches.length;
  }

  const content = lines.join("\n");

  await fs.mkdir(path.dirname(homePath), { recursive: true });
  await fs.writeFile(homePath, content, "utf8");

  log.info({ path: HOME_PATH, total }, "gen-home completed");

  writeJsonStdout(
    {
      path: HOME_PATH,
      topics: docs.filter((d) => d.docType === "topic").length,
      entities: docs.filter((d) => d.docType === "entity").length,
      concepts: docs.filter((d) => d.docType === "concept").length,
      total
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
