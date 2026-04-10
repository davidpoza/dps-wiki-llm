import { ensureParentDirectory } from "./fs-utils.mjs";

let databaseSyncPromise = null;

async function getDatabaseSync() {
  if (!databaseSyncPromise) {
    const originalEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = (warning, ...args) => {
      const message = typeof warning === "string" ? warning : warning?.message;
      if (typeof message === "string" && message.includes("SQLite is an experimental feature")) {
        return;
      }

      return originalEmitWarning(warning, ...args);
    };

    databaseSyncPromise = import("node:sqlite").then((module) => module.DatabaseSync);
  }

  return databaseSyncPromise;
}

export async function openDatabase(dbPath) {
  await ensureParentDirectory(dbPath);
  const DatabaseSync = await getDatabaseSync();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA temp_store = MEMORY;");
  return db;
}

export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      updated_at TEXT,
      body TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
      title,
      body,
      content='docs',
      content_rowid='id'
    );
  `);
}

export function rebuildFts(db) {
  db.exec(`INSERT INTO docs_fts(docs_fts) VALUES('rebuild');`);
}
