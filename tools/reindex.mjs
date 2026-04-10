#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import { relativeVaultPath, resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.mjs";
import { ensureSchema, openDatabase, rebuildFts } from "./lib/db.mjs";
import { loadWikiDocs } from "./lib/wiki-inspect.mjs";

/**
 * Rebuild the docs table and FTS index from the current wiki markdown state.
 */

/**
 * Resolve the database location, defaulting to the canonical vault path.
 *
 * @param {{ db: string | null }} args
 * @param {string} vaultRoot
 * @returns {string}
 */
function parseDbPath(args, vaultRoot) {
  if (args.db) {
    return resolveWithinRoot(vaultRoot, args.db);
  }

  return resolveWithinRoot(vaultRoot, "state/kb.db");
}

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const dbPath = parseDbPath(args, vaultRoot);
  const docs = await loadWikiDocs(vaultRoot);

  const db = await openDatabase(dbPath);

  try {
    ensureSchema(db);
    db.exec("BEGIN IMMEDIATE;");
    db.exec("DELETE FROM docs;");

    const insertDoc = db.prepare(`
      INSERT INTO docs(path, title, doc_type, updated_at, body)
      VALUES (?, ?, ?, ?, ?);
    `);

    for (const doc of docs) {
      insertDoc.run(doc.relativePath, doc.title, doc.docType, doc.updatedAt, doc.body.trim());
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
      indexed: docs.length,
      fts_rebuilt: true
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
