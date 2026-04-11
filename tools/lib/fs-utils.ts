import fs from "node:fs/promises";
import path from "node:path";

import { SYSTEM_CONFIG } from "../config.js";

/**
 * Filesystem helpers that enforce all reads and writes stay inside the vault.
 */

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Resolve the canonical absolute path of the target vault root.
 *
 * @param {string} [vaultPath=process.cwd()]
 * @returns {string}
 */
export function resolveVaultRoot(vaultPath = SYSTEM_CONFIG.cli.defaultVault()): string {
  return path.resolve(vaultPath);
}

/**
 * Resolve a relative path inside the vault and reject path traversal attempts.
 *
 * @param {string} rootPath
 * @param {string} relativePath
 * @returns {string}
 */
export function resolveWithinRoot(rootPath: string, relativePath: string): string {
  const root = path.resolve(rootPath);
  const target = path.resolve(root, relativePath);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to access path outside vault root: ${relativePath}`);
  }

  return target;
}

/**
 * Ensure a directory exists, creating parent directories as needed.
 *
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Ensure the parent directory for a file path exists.
 *
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
}

/**
 * Read a UTF-8 text file, returning null when the file does not exist.
 *
 * @param {string} filePath
 * @returns {Promise<string | null>}
 */
export async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

/**
 * Check whether a filesystem path exists.
 *
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

/**
 * Load a JSON file or return a caller-provided fallback when it is missing.
 *
 * @param {string} filePath
 * @param {any} fallbackValue
 * @returns {Promise<any>}
 */
export async function loadJsonFile<T>(filePath: string, fallbackValue: T): Promise<T> {
  const raw = await readTextIfExists(filePath);

  if (raw === null) {
    return fallbackValue;
  }

  return JSON.parse(raw) as T;
}

/**
 * Write UTF-8 text, creating parent directories when needed.
 *
 * @param {string} filePath
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function writeTextFile(filePath: string, text: string): Promise<void> {
  await ensureParentDirectory(filePath);
  await fs.writeFile(filePath, text, "utf8");
}

/**
 * Write pretty-printed JSON terminated by a trailing newline.
 *
 * @param {string} filePath
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Normalize a filesystem path to POSIX separators for stored metadata.
 *
 * @param {string} inputPath
 * @returns {string}
 */
export function toPosixPath(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}

/**
 * Convert an absolute path back into a vault-relative POSIX path.
 *
 * @param {string} rootPath
 * @param {string} absolutePath
 * @returns {string}
 */
export function relativeVaultPath(rootPath: string, absolutePath: string): string {
  return toPosixPath(path.relative(rootPath, absolutePath));
}
