#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import { resolveVaultRoot, resolveWithinRoot, relativeVaultPath } from "./lib/fs-utils.mjs";
import { ensureSchema, openDatabase } from "./lib/db.mjs";

function parseSearchArgs() {
  const args = parseArgs();
  let limit = Number.isFinite(args.limit) && args.limit > 0 ? args.limit : 8;
  let query = null;
  let skipNext = false;

  for (const token of process.argv.slice(2)) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (["--vault", "--input", "--db", "--limit"].includes(token)) {
      skipNext = true;
      continue;
    }

    if (["--no-write", "--write", "--compact"].includes(token)) {
      continue;
    }

    if (!token.startsWith("--") && query === null) {
      query = token;
    }
  }

  if (!query || !query.trim()) {
    throw new Error("Expected search query as the first positional argument");
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Expected a positive numeric value for --limit");
  }

  return {
    ...args,
    query: query.trim(),
    limit
  };
}

async function main() {
  const args = parseSearchArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const dbPath = args.db ? resolveWithinRoot(vaultRoot, args.db) : resolveWithinRoot(vaultRoot, "state/kb.db");
  const db = await openDatabase(dbPath);

  let rows;
  try {
    ensureSchema(db);
    const statement = db.prepare(`
      SELECT d.path, d.title, d.doc_type, bm25(docs_fts) AS score
      FROM docs_fts
      JOIN docs d ON d.id = docs_fts.rowid
      WHERE docs_fts MATCH ?
      ORDER BY score
      LIMIT ?;
    `);

    rows = statement.all(args.query, args.limit);
  } finally {
    db.close();
  }

  writeJsonStdout(
    {
      query: args.query,
      limit: args.limit,
      db_path: relativeVaultPath(vaultRoot, dbPath),
      results: rows.map((row) => ({
        path: row.path,
        title: row.title,
        doc_type: row.doc_type,
        score: Number(row.score)
      }))
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
