import { ensureParentDirectory } from "./fs-utils.js";
import { SYSTEM_CONFIG } from "../config.js";

export interface DatabaseStatement {
  run(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
}

export interface DatabaseConnection {
  close(): void;
  exec(sql: string): unknown;
  prepare(sql: string): DatabaseStatement;
}

interface DatabaseSyncConstructor {
  new (path: string): DatabaseConnection;
}

let databaseSyncPromise: Promise<DatabaseSyncConstructor> | null = null;

/**
 * SQLite access helpers shared by indexing and retrieval scripts.
 */

/**
 * Lazily import the synchronous SQLite constructor while suppressing the
 * experimental warning emitted by Node's built-in module.
 *
 * @returns {Promise<any>}
 */
async function getDatabaseSync(): Promise<DatabaseSyncConstructor> {
  if (!databaseSyncPromise) {
    const originalEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = ((warning, ...args) => {
      const message = typeof warning === "string" ? warning : warning?.message;
      if (typeof message === "string" && message.includes(SYSTEM_CONFIG.database.experimentalWarningText)) {
        return;
      }

      return (originalEmitWarning as (...input: unknown[]) => void)(warning, ...args);
    }) as typeof process.emitWarning;

    databaseSyncPromise = import("node:sqlite").then((module) => module.DatabaseSync as DatabaseSyncConstructor);
  }

  return databaseSyncPromise;
}

/**
 * Open the SQLite database file with repository-specific pragmas applied.
 *
 * @param {string} dbPath
 * @returns {Promise<any>}
 */
export async function openDatabase(dbPath: string): Promise<DatabaseConnection> {
  await ensureParentDirectory(dbPath);
  const DatabaseSync = await getDatabaseSync();
  const db = new DatabaseSync(dbPath);
  for (const pragma of SYSTEM_CONFIG.database.pragmas) {
    db.exec(pragma);
  }
  return db;
}

/**
 * Ensure the relational docs table and the FTS shadow table exist.
 *
 * @param {any} db
 */
export function ensureSchema(db: DatabaseConnection): void {
  db.exec(SYSTEM_CONFIG.database.docsTableSql);
  db.exec(SYSTEM_CONFIG.database.docsFtsTableSql);
}

/**
 * Rebuild the FTS table from the current contents of the docs table.
 *
 * @param {any} db
 */
export function rebuildFts(db: DatabaseConnection): void {
  db.exec(SYSTEM_CONFIG.database.rebuildFtsSql);
}
