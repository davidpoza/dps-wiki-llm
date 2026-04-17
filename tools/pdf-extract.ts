#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pdf2md = require("@opendocsg/pdf2md") as (pdfBuffer: ArrayBuffer) => Promise<string>;

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot, resolveWithinRoot, writeTextFile } from "./lib/fs-utils.js";

type InputPayload = {
  telegram_file_id?: string;
  local_path?: string;
  filename?: string;
  captured_at?: string;
};

type Result =
  | {
      status: "created";
      raw_path: string;
      title: string;
      filename: string;
      captured_at: string;
      character_count: number;
    }
  | {
      status: "error";
      reason: string;
      filename?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

function frontmatterValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return `\n${value.map((entry) => `  - ${JSON.stringify(entry)}`).join("\n")}`;
  }

  return JSON.stringify(value);
}

function normalizeCapturedAt(value: unknown): string {
  const candidate = stringValue(value);
  const date = candidate ? new Date(candidate) : new Date();

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid captured_at timestamp: ${candidate}`);
  }

  return date.toISOString();
}

async function downloadTelegramFile(fileId: string, tempDir: string): Promise<string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }

  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const metaResponse = await fetch(getFileUrl);
  if (!metaResponse.ok) {
    throw new Error(`Telegram getFile failed: ${metaResponse.status} ${metaResponse.statusText}`);
  }

  const metaJson = (await metaResponse.json()) as unknown;
  if (!isRecord(metaJson) || !metaJson.ok || !isRecord(metaJson.result)) {
    throw new Error("Telegram getFile returned unexpected response");
  }

  const filePath = stringValue(metaJson.result.file_path);
  if (!filePath) {
    throw new Error("Telegram getFile returned no file_path");
  }

  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) {
    throw new Error(`Telegram file download failed: ${fileResponse.status} ${fileResponse.statusText}`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const localPath = path.join(tempDir, "download.pdf");
  await fs.writeFile(localPath, Buffer.from(arrayBuffer));
  return localPath;
}

function buildRawMarkdown(input: {
  title: string;
  filename: string;
  capturedAt: string;
  sourceRef: string;
  markdownContent: string;
}): string {
  const frontmatter: Record<string, string | string[]> = {
    title: input.title,
    type: "source",
    source_kind: "web",
    captured_at: input.capturedAt,
    source_ref: input.sourceRef,
    tags: ["pdf", "telegram-ingest"]
  };

  return `---\n${Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValue(value)}`)
    .join("\n")}\n---\n\n# ${input.title}\n\n${input.markdownContent}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("pdf-extract");
  const vaultRoot = resolveVaultRoot(args.vault);
  const input = await readJsonInput<InputPayload>(args.input);

  const fileId = stringValue(input.telegram_file_id);
  const localPath = stringValue(input.local_path);
  const filename = stringValue(input.filename) || "document.pdf";
  const capturedAt = normalizeCapturedAt(input.captured_at);

  if (!fileId && !localPath) {
    writeJsonStdout({ status: "error", reason: "Missing telegram_file_id or local_path", filename } satisfies Result, args.pretty);
    return;
  }

  log.info({ filename, has_file_id: Boolean(fileId), has_local_path: Boolean(localPath) }, "pdf-extract started");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dps-wiki-llm-pdf-"));

  try {
    const pdfPath = fileId ? await downloadTelegramFile(fileId, tempDir) : localPath!;

    log.info({ pdf_path: pdfPath }, "pdf-extract: running pdf2md");
    const pdfBuffer = await fs.readFile(pdfPath);
    const markdownContent = await pdf2md(pdfBuffer.buffer as ArrayBuffer);

    if (!markdownContent.trim()) {
      writeJsonStdout({ status: "error", reason: "no text content", filename } satisfies Result, args.pretty);
      return;
    }

    const baseName = path.basename(filename, path.extname(filename));
    const title = baseName || "PDF Document";
    const datePrefix = capturedAt.slice(0, 10);
    const slug = slugify(title, "pdf");
    const hash = crypto
      .createHash("sha256")
      .update(`${filename}:${capturedAt}:${markdownContent.length}`)
      .digest("hex")
      .slice(0, 8);
    const rawPath = path.posix.join(SYSTEM_CONFIG.paths.rawDir, "web", `${datePrefix}-pdf-${slug}-${hash}.md`);
    const sourceRef = fileId ? `telegram:${fileId}` : `local:${filename}`;

    const markdown = buildRawMarkdown({
      title,
      filename,
      capturedAt,
      sourceRef,
      markdownContent
    });

    await writeTextFile(resolveWithinRoot(vaultRoot, rawPath), markdown);

    log.info({ raw_path: rawPath, character_count: markdownContent.length }, "pdf-extract completed");
    writeJsonStdout(
      {
        status: "created",
        raw_path: rawPath,
        title,
        filename,
        captured_at: capturedAt,
        character_count: markdownContent.length
      } satisfies Result,
      args.pretty
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
