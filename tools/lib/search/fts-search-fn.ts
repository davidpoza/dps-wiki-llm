/**
 * @module fts-search-fn
 *
 * Pure-function wrapper around the SQLite FTS5 (BM25) search logic.
 * Extracted from `search.ts` so callers within the same process (e.g.
 * `hybrid-search-fn`, `health-check`) can reuse a single open database
 * connection and avoid subprocess overhead.
 */

import { resolveVaultRoot, resolveWithinRoot, relativeVaultPath } from "../storage/fs-utils.js";
import { ensureSchema, openDatabase } from "../storage/db.js";
import { SYSTEM_CONFIG } from "../../config.js";
import type { SearchResult } from "../core/contracts.js";

// ── Stop-words & synonym table (copied verbatim from search.ts) ────────────────

const STOP_WORDS = new Set([
  "a", "about", "al", "and", "best", "con", "dame", "de", "del", "el", "en",
  "for", "give", "la", "las", "lo", "los", "me", "mejor", "mejores", "of",
  "on", "para", "por", "que", "sobre", "the", "to", "un", "una", "y"
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

export function buildFtsQuery(query: string): string {
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

// ── Public API ─────────────────────────────────────────────────────────────────

export interface FtsSearchOptions {
  vault?: string;
  /** Override the default db path (relative to vault root). */
  dbPath?: string;
  limit?: number;
  docType?: string | null;
}

/**
 * Run a BM25 full-text search against the SQLite index.
 *
 * Opens and closes the database on each call — appropriate for the health-check
 * use case where many queries are issued sequentially and connection pooling
 * would add complexity with no measurable benefit at this scale.
 *
 * @param query   - Raw natural-language query string.
 * @param options - Optional vault/db/limit/docType overrides.
 * @returns `SearchResult` with BM25-scored rows, sorted ascending by score
 *          (BM25 scores are negative; less negative = more relevant).
 */
export async function ftsSearch(query: string, options: FtsSearchOptions = {}): Promise<SearchResult> {
  const vaultRoot = resolveVaultRoot(options.vault);
  const dbFullPath = options.dbPath
    ? resolveWithinRoot(vaultRoot, options.dbPath)
    : resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.dbPath);
  const limit = options.limit ?? SYSTEM_CONFIG.cli.defaultSearchLimit;
  const ftsQuery = buildFtsQuery(query);

  const db = await openDatabase(dbFullPath);
  let rows: Array<{ path: string; title: string; doc_type: string; score: number }>;

  try {
    ensureSchema(db);
    const statement = options.docType
      ? db.prepare(`
          SELECT d.path, d.title, d.doc_type, bm25(docs_fts) AS score
          FROM docs_fts
          JOIN docs d ON d.id = docs_fts.rowid
          WHERE docs_fts MATCH ? AND d.doc_type = ?
          ORDER BY score
          LIMIT ?;
        `)
      : db.prepare(`
          SELECT d.path, d.title, d.doc_type, bm25(docs_fts) AS score
          FROM docs_fts
          JOIN docs d ON d.id = docs_fts.rowid
          WHERE docs_fts MATCH ?
          ORDER BY score
          LIMIT ?;
        `);

    rows = (
      options.docType
        ? statement.all(ftsQuery, options.docType, limit)
        : statement.all(ftsQuery, limit)
    ) as Array<{ path: string; title: string; doc_type: string; score: number }>;
  } finally {
    db.close();
  }

  return {
    query,
    fts_query: ftsQuery,
    limit,
    db_path: relativeVaultPath(vaultRoot, dbFullPath),
    results: rows.map((row) => ({
      path: row.path,
      title: row.title,
      doc_type: row.doc_type,
      score: Number(row.score)
    }))
  } as SearchResult;
}
