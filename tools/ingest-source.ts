#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import type { JsonObject, JsonValue, NormalizedSourcePayload } from "./lib/contracts.js";
import { relativeVaultPath, resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.js";
import { splitFrontmatter } from "./lib/frontmatter.js";
import { isRecord, stringValue } from "./lib/type-guards.js";

/**
 * Normalize a raw vault artifact into the canonical source payload consumed by planners.
 */

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.map(jsonValue).filter((item): item is JsonValue => item !== undefined);
    return items;
  }

  if (isRecord(value)) {
    const output: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = jsonValue(entry);
      if (normalized !== undefined) {
        output[key] = normalized;
      }
    }

    return output;
  }

  return undefined;
}

function jsonObject(value: unknown): JsonObject {
  const normalized = jsonValue(value);
  return isRecord(normalized) ? normalized : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function titleFromFilename(rawPath: string): string {
  const baseName = path.posix.basename(rawPath, path.posix.extname(rawPath));
  const withoutDate = baseName.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, "");

  return withoutDate
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function extractHeading(body: string): string | undefined {
  const match = /^#\s+(.+?)\s*$/m.exec(body);
  return match?.[1]?.trim();
}

function normalizeTimestamp(value: unknown, fallback: Date): string {
  const text = stringValue(value);
  if (!text) {
    return fallback.toISOString();
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid captured_at timestamp: ${text}`);
  }

  return parsed.toISOString();
}

function normalizeRawPath(vaultRoot: string, input: Record<string, unknown>): string {
  const candidate =
    stringValue(input.raw_path) ||
    stringValue(input.rawPath) ||
    stringValue(input.path) ||
    stringValue(input.file_path) ||
    stringValue(input.filePath) ||
    stringValue(input.filename);

  if (!candidate) {
    throw new Error("ingest-source requires raw_path, path, file_path, filePath, or filename");
  }

  let relativePath: string;
  if (path.isAbsolute(candidate)) {
    const absolutePath = path.resolve(candidate);
    relativePath = relativeVaultPath(vaultRoot, absolutePath);
  } else {
    relativePath = candidate.replaceAll("\\", "/").replace(/^\/+/, "");
  }

  if (!relativePath.startsWith(`${SYSTEM_CONFIG.paths.rawDir}/`)) {
    throw new Error(`ingest-source only accepts paths under ${SYSTEM_CONFIG.paths.rawDir}/: ${relativePath}`);
  }

  if (relativePath.split("/").includes("..")) {
    throw new Error(`ingest-source rejects path traversal in raw path: ${relativePath}`);
  }

  return relativePath;
}

function inferSourceKind(rawPath: string, input: Record<string, unknown>, frontmatter: Record<string, unknown>): string {
  const explicit = stringValue(input.source_kind) || stringValue(frontmatter.source_kind);
  if (explicit) {
    return explicit;
  }

  const folder = rawPath.split("/")[1] || "";
  return SYSTEM_CONFIG.ingest.sourceKindFolders[folder] || SYSTEM_CONFIG.ingest.defaultSourceKind;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("ingest-source");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info("ingest-source started");

  const input = await readJsonInput(args.input);

  if (!isRecord(input)) {
    throw new Error("ingest-source input must be a JSON object");
  }

  const rawPath = normalizeRawPath(vaultRoot, input);
  const absolutePath = resolveWithinRoot(vaultRoot, rawPath);
  const [rawText, stats] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);
  const checksumHex = crypto.createHash("sha256").update(rawText).digest("hex");
  const checksum = `sha256:${checksumHex}`;
  const { frontmatter, body } = splitFrontmatter(rawText);
  const capturedAt = normalizeTimestamp(input.captured_at || frontmatter.captured_at, stats.mtime);
  const sourceKind = inferSourceKind(rawPath, input, frontmatter);
  const title =
    stringValue(input.title) ||
    stringValue(frontmatter.title) ||
    extractHeading(body) ||
    titleFromFilename(rawPath) ||
    "Untitled Source";
  const sourceId =
    stringValue(input.source_id) ||
    `src-${capturedAt.slice(0, 10)}-${sourceKind}-${checksumHex.slice(0, SYSTEM_CONFIG.ingest.sourceIdHashLength)}`;
  const metadata = jsonObject(input.metadata);
  const tags = stringArray(input.tags).length > 0 ? stringArray(input.tags) : stringArray(frontmatter.tags);

  if (tags.length > 0) {
    metadata.tags = tags;
  }

  const payload: NormalizedSourcePayload = {
    source_id: sourceId,
    source_kind: sourceKind,
    captured_at: capturedAt,
    raw_path: rawPath,
    title,
    content: body.trim(),
    language: stringValue(input.language) || stringValue(frontmatter.language) || "unknown",
    checksum,
    metadata
  };

  const canonicalUrl =
    stringValue(input.canonical_url) ||
    stringValue(input.url) ||
    stringValue(frontmatter.canonical_url) ||
    stringValue(frontmatter.url);
  const author = stringValue(input.author) || stringValue(frontmatter.author);

  if (canonicalUrl) {
    payload.canonical_url = canonicalUrl;
  }

  if (author) {
    payload.author = author;
  }

  log.info({ source_id: payload.source_id, raw_path: payload.raw_path }, "ingest-source completed");
  writeJsonStdout(payload, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
