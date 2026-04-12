#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { resolveVaultRoot, resolveWithinRoot, relativeVaultPath } from "./lib/fs-utils.js";
import { ensureSchema, openDatabase } from "./lib/db.js";
import { SYSTEM_CONFIG } from "./config.js";

/**
 * Search the SQLite FTS index built from wiki markdown documents.
 */

const STOP_WORDS = new Set([
  "a",
  "about",
  "al",
  "and",
  "best",
  "con",
  "dame",
  "de",
  "del",
  "el",
  "en",
  "for",
  "give",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "mejor",
  "mejores",
  "of",
  "on",
  "para",
  "por",
  "que",
  "sobre",
  "the",
  "to",
  "un",
  "una",
  "y"
]);

const QUERY_SYNONYMS: Record<string, string[]> = {
  consejos: ["tips"],
  estrategia: ["strategy"],
  estrategias: ["strategies"],
  gestion: ["management"],
  habito: ["habit"],
  habitos: ["habits"],
  productividad: ["productivity"],
  tiempo: ["time"],
  trabajo: ["work"]
};

/**
 * Parse shared CLI flags plus the first positional search query.
 *
 * @returns {{ _: string[], vault: string, input: string | null, db: string | null, limit: number, write: boolean, pretty: boolean, query: string }}
 */
function parseSearchArgs() {
  const args = parseArgs();
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
      ? args.limit
      : SYSTEM_CONFIG.cli.defaultSearchLimit;
  let query: string | null = null;
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

function normalizeToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function buildFtsQuery(query: string): string {
  const tokens = query
    .split(/[\s"'`.,;:!?()[\]{}<>/\\|]+/g)
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  const expanded = new Set<string>();

  for (const token of tokens) {
    expanded.add(token);
    for (const synonym of QUERY_SYNONYMS[token] ?? []) {
      expanded.add(synonym);
    }
  }

  const terms = [...expanded].map((term) => `"${term.replaceAll('"', '""')}"`);
  return terms.length > 0 ? terms.join(" OR ") : `"${query.replaceAll('"', '""')}"`;
}

async function main(): Promise<void> {
  const args = parseSearchArgs();
  const ftsQuery = buildFtsQuery(args.query);
  const vaultRoot = resolveVaultRoot(args.vault);
  const dbPath = args.db ? resolveWithinRoot(vaultRoot, args.db) : resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.dbPath);
  const db = await openDatabase(dbPath);

  let rows: Array<{ path: string; title: string; doc_type: string; score: number }>;
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

    rows = statement.all(ftsQuery, args.limit) as Array<{ path: string; title: string; doc_type: string; score: number }>;
  } finally {
    db.close();
  }

  writeJsonStdout(
    {
      query: args.query,
      fts_query: ftsQuery,
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
