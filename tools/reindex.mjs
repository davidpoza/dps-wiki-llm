#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import { splitFrontmatter } from "./lib/frontmatter.mjs";
import { relativeVaultPath, resolveVaultRoot, resolveWithinRoot, toPosixPath } from "./lib/fs-utils.mjs";
import { ensureSchema, openDatabase, rebuildFts } from "./lib/db.mjs";

async function walkMarkdownFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && absolutePath.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

function parseDbPath(args, vaultRoot) {
  if (args.db) {
    return resolveWithinRoot(vaultRoot, args.db);
  }

  return resolveWithinRoot(vaultRoot, "state/kb.db");
}

function inferDocType(relativePath, frontmatter) {
  if (typeof frontmatter.type === "string" && frontmatter.type.trim()) {
    return frontmatter.type.trim();
  }

  const parts = toPosixPath(relativePath).split("/");
  if (parts.includes("concepts")) {
    return "concept";
  }

  if (parts.includes("entities")) {
    return "entity";
  }

  if (parts.includes("topics")) {
    return "topic";
  }

  if (parts.includes("sources")) {
    return "source";
  }

  if (parts.includes("analyses")) {
    return "analysis";
  }

  return "unknown";
}

function extractTitle(relativePath, frontmatter, body) {
  if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    return frontmatter.title.trim();
  }

  const match = body.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }

  return path.basename(relativePath, path.extname(relativePath));
}

function extractUpdatedAt(frontmatter, stats) {
  if (typeof frontmatter.updated === "string" && frontmatter.updated.trim()) {
    return frontmatter.updated.trim();
  }

  if (typeof frontmatter.updated_at === "string" && frontmatter.updated_at.trim()) {
    return frontmatter.updated_at.trim();
  }

  return stats.mtime.toISOString();
}

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const wikiRoot = resolveWithinRoot(vaultRoot, "wiki");
  const dbPath = parseDbPath(args, vaultRoot);
  const files = await walkMarkdownFiles(wikiRoot).catch((error) => {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  });

  const db = await openDatabase(dbPath);

  try {
    ensureSchema(db);
    db.exec("BEGIN IMMEDIATE;");
    db.exec("DELETE FROM docs;");

    const insertDoc = db.prepare(`
      INSERT INTO docs(path, title, doc_type, updated_at, body)
      VALUES (?, ?, ?, ?, ?);
    `);

    for (const absolutePath of files) {
      const relativePath = relativeVaultPath(vaultRoot, absolutePath);
      const stats = await fs.stat(absolutePath);
      const raw = await fs.readFile(absolutePath, "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      const title = extractTitle(relativePath, frontmatter, body);
      const docType = inferDocType(relativePath, frontmatter);
      const updatedAt = extractUpdatedAt(frontmatter, stats);

      insertDoc.run(relativePath, title, docType, updatedAt, body.trim());
    }

    rebuildFts(db);
    db.exec("COMMIT;");
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Ignore rollback failures after partial transaction state.
    }
    throw error;
  } finally {
    db.close();
  }

  writeJsonStdout(
    {
      db_path: relativeVaultPath(vaultRoot, dbPath),
      indexed: files.length,
      fts_rebuilt: true
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
