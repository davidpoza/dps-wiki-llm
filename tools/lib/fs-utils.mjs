import fs from "node:fs/promises";
import path from "node:path";

export function resolveVaultRoot(vaultPath = process.cwd()) {
  return path.resolve(vaultPath);
}

export function resolveWithinRoot(rootPath, relativePath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(root, relativePath);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to access path outside vault root: ${relativePath}`);
  }

  return target;
}

export async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureParentDirectory(filePath) {
  await ensureDirectory(path.dirname(filePath));
}

export async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function loadJsonFile(filePath, fallbackValue) {
  const raw = await readTextIfExists(filePath);

  if (raw === null) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}

export async function writeTextFile(filePath, text) {
  await ensureParentDirectory(filePath);
  await fs.writeFile(filePath, text, "utf8");
}

export async function writeJsonFile(filePath, value) {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

export function relativeVaultPath(rootPath, absolutePath) {
  return toPosixPath(path.relative(rootPath, absolutePath));
}
