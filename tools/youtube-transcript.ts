#!/usr/bin/env node

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import type { JsonObject } from "./lib/contracts.js";
import { resolveVaultRoot, resolveWithinRoot, writeTextFile } from "./lib/fs-utils.js";

type TranscriptSegment = {
  start_ms: number;
  duration_ms: number | null;
  text: string;
};

type InputPayload = {
  url?: string;
  captured_at?: string;
  language_preferences?: string[];
  title?: string;
  metadata?: JsonObject;
};

type Result =
  | {
      status: "created";
      raw_path: string;
      title: string;
      video_id: string;
      url: string;
      captured_at: string;
      caption_language: string;
      caption_name: string;
      caption_kind: string;
      segment_count: number;
      character_count: number;
    }
  | {
      status: "failed";
      reason: string;
      url?: string;
      video_id?: string;
    };

type SubtitleKind = "manual" | "asr";

type SubtitleCandidate = {
  language: string;
  name: string;
  kind: SubtitleKind;
};

type LoadedSubtitle = {
  candidate: SubtitleCandidate;
  segments: TranscriptSegment[];
};

type YtDlpInfo = {
  id?: unknown;
  title?: unknown;
  uploader?: unknown;
  channel?: unknown;
  webpage_url?: unknown;
  subtitles?: unknown;
  automatic_captions?: unknown;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractVideoId(inputUrl: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(inputUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return isValidVideoId(id) ? id : null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const direct = parsed.searchParams.get("v");
    if (isValidVideoId(direct)) {
      return direct;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((part) => ["shorts", "embed", "live"].includes(part));
    if (marker >= 0 && isValidVideoId(parts[marker + 1])) {
      return parts[marker + 1];
    }
  }

  return null;
}

function isValidVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{11}$/.test(value);
}

function normalizeCapturedAt(value: unknown): string {
  const candidate = stringValue(value);
  const date = candidate ? new Date(candidate) : new Date();

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid captured_at timestamp: ${candidate}`);
  }

  return date.toISOString();
}

function normalizeLanguagePreferences(value: string[] | undefined): string[] {
  const preferences = (value ?? ["en", "es"])
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean);

  return preferences.length > 0 ? preferences : ["en", "es"];
}

async function runYtDlp(args: string[]): Promise<CommandResult> {
  const binary = process.env.YTDLP_BINARY || "yt-dlp";
  const prefixArgs = parseYtDlpBinaryArgs(process.env.YTDLP_BINARY_ARGS);
  const ioDir = await fs.mkdtemp(path.join(os.tmpdir(), "dps-wiki-llm-ytdlp-stdio-"));
  const stdoutPath = path.join(ioDir, "stdout");
  const stderrPath = path.join(ioDir, "stderr");
  const stdoutFile = await fs.open(stdoutPath, "w");
  const stderrFile = await fs.open(stderrPath, "w");

  try {
    const { code } = await new Promise<{ code: number | null }>((resolve, reject) => {
      const child = spawn(binary, [...prefixArgs, ...args], {
        stdio: ["ignore", stdoutFile.fd, stderrFile.fd]
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          reject(new Error(`yt-dlp executable not found: ${binary}`));
          return;
        }

        reject(error);
      });
      child.on("close", (exitCode) => {
        resolve({ code: exitCode });
      });
    });

    await stdoutFile.close();
    await stderrFile.close();

    const stdout = await fs.readFile(stdoutPath, "utf8");
    const stderr = await fs.readFile(stderrPath, "utf8");

    if (code !== 0) {
      const detail = stderr.trim() || stdout.trim() || "no stderr";
      throw new Error(`yt-dlp failed with exit code ${code}: ${detail}`);
    }

    return { stdout, stderr };
  } finally {
    await stdoutFile.close().catch(() => undefined);
    await stderrFile.close().catch(() => undefined);
    await fs.rm(ioDir, { recursive: true, force: true });
  }
}

function parseYtDlpBinaryArgs(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new Error("YTDLP_BINARY_ARGS must be a JSON array of strings");
  }

  return parsed;
}

async function loadYtDlpInfo(url: string): Promise<YtDlpInfo | null> {
  const result = await runYtDlp(["--dump-json", "--skip-download", "--no-playlist", "--no-warnings", url]);
  const payload = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!payload) {
    return null;
  }

  const parsed = JSON.parse(payload) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function subtitleCandidatesFromInfo(info: YtDlpInfo): SubtitleCandidate[] {
  return [
    ...subtitleCandidatesFromMap(info.subtitles, "manual"),
    ...subtitleCandidatesFromMap(info.automatic_captions, "asr")
  ];
}

function subtitleCandidatesFromMap(value: unknown, kind: SubtitleKind): SubtitleCandidate[] {
  if (!isRecord(value)) {
    return [];
  }

  const candidates: SubtitleCandidate[] = [];
  for (const [language, entries] of Object.entries(value)) {
    if (!language.trim()) {
      continue;
    }

    const subtitleEntries = Array.isArray(entries) ? entries.filter(isRecord) : [];
    const name = subtitleEntries.map((entry) => stringValue(entry.name)).find(Boolean) ?? language;

    candidates.push({
      language,
      name,
      kind
    });
  }

  return candidates;
}

function orderSubtitleCandidates(candidates: SubtitleCandidate[], languagePreferences: string[]): SubtitleCandidate[] {
  const ordered: SubtitleCandidate[] = [];
  const add = (candidate: SubtitleCandidate | undefined) => {
    if (candidate && !ordered.includes(candidate)) {
      ordered.push(candidate);
    }
  };

  for (const preference of languagePreferences) {
    for (const kind of ["manual", "asr"] satisfies SubtitleKind[]) {
      for (const candidate of candidates.filter((entry) => entry.kind === kind && entry.language.toLowerCase() === preference)) {
        add(candidate);
      }
    }

    for (const kind of ["manual", "asr"] satisfies SubtitleKind[]) {
      for (const candidate of candidates.filter((entry) => entry.kind === kind && languageMatchesPreference(entry.language, preference))) {
        add(candidate);
      }
    }
  }

  for (const candidate of candidates.filter((entry) => entry.kind === "manual")) {
    add(candidate);
  }
  for (const candidate of candidates) {
    add(candidate);
  }

  return ordered;
}

function languageMatchesPreference(language: string, preference: string): boolean {
  const normalized = language.toLowerCase();
  return normalized === preference || normalized.startsWith(`${preference}-`) || normalized.startsWith(`${preference}_`);
}

async function downloadSubtitle(url: string, candidate: SubtitleCandidate, outputDir: string): Promise<void> {
  const subtitleFlag = candidate.kind === "asr" ? "--write-auto-subs" : "--write-subs";

  await runYtDlp([
    "--skip-download",
    subtitleFlag,
    "--sub-langs",
    candidate.language,
    "--sub-format",
    "json3/srv3/vtt/best",
    "--no-playlist",
    "--no-warnings",
    "--paths",
    outputDir,
    "-o",
    "%(id)s.%(ext)s",
    url
  ]);
}

async function loadFirstUsableSubtitle(url: string, candidates: SubtitleCandidate[]): Promise<LoadedSubtitle | null> {
  let lastError: string | null = null;

  for (const candidate of candidates) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dps-wiki-llm-ytdlp-"));

    try {
      await downloadSubtitle(url, candidate, tempDir);
      const subtitleFiles = await listSubtitleFiles(tempDir);
      const subtitleFile = selectDownloadedSubtitle(subtitleFiles, candidate);

      if (!subtitleFile) {
        lastError = `No subtitle file downloaded for ${candidate.language} (${candidate.kind})`;
        continue;
      }

      const segments = await loadSubtitleSegments(subtitleFile);
      if (segments.length > 0) {
        return { candidate, segments };
      }

      lastError = `Downloaded subtitle file was empty for ${candidate.language} (${candidate.kind})`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  if (lastError) {
    console.error(`yt-dlp subtitle extraction failed for all candidates: ${lastError}`);
  }

  return null;
}

async function listSubtitleFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const allowedExtensions = new Set([".vtt", ".json3", ".srv3", ".xml", ".ttml"]);

  async function visit(dir: string): Promise<void> {
    let entries: Dirent<string>[];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }

      if (entry.isFile() && allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    }
  }

  await visit(root);
  return files.sort();
}

function selectDownloadedSubtitle(files: string[], candidate: SubtitleCandidate): string | null {
  const languageMarker = `.${candidate.language.toLowerCase()}.`;
  return files.find((file) => path.basename(file).toLowerCase().includes(languageMarker)) ?? files[0] ?? null;
}

async function loadSubtitleSegments(filePath: string): Promise<TranscriptSegment[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json3") {
    return parseTranscriptJsonSafe(raw) ?? [];
  }

  if (extension === ".srv3") {
    return parseSrv3Xml(raw);
  }

  if (extension === ".xml" || extension === ".ttml") {
    return parseTranscriptXml(raw);
  }

  if (extension === ".vtt") {
    return parseVtt(raw);
  }

  return parseVtt(raw);
}

function parseTranscriptJsonSafe(text: string): TranscriptSegment[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parseTranscriptJson(parsed);
  } catch {
    return null;
  }
}

function parseTranscriptJson(value: unknown): TranscriptSegment[] {
  if (!isRecord(value)) {
    return [];
  }

  const events = value.events;
  if (!Array.isArray(events)) {
    return [];
  }

  const segments: TranscriptSegment[] = [];
  for (const event of events) {
    if (!isRecord(event) || !Array.isArray(event.segs)) {
      continue;
    }

    const text = event.segs
      .map((segment) => (isRecord(segment) && typeof segment.utf8 === "string" ? segment.utf8 : ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      continue;
    }

    segments.push({
      start_ms: typeof event.tStartMs === "number" ? event.tStartMs : 0,
      duration_ms: typeof event.dDurationMs === "number" ? event.dDurationMs : null,
      text
    });
  }

  return segments;
}

function parseTranscriptXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const start = /start="([^"]+)"/.exec(attrs)?.[1];
    const duration = /dur="([^"]+)"/.exec(attrs)?.[1];
    const text = decodeXml(body).replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }

    segments.push({
      start_ms: start ? Math.round(Number(start) * 1000) : 0,
      duration_ms: duration ? Math.round(Number(duration) * 1000) : null,
      text
    });
  }

  return segments;
}

function parseSrv3Xml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const pattern = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml)) !== null) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const start = /\bt="([^"]+)"/.exec(attrs)?.[1];
    const duration = /\bd="([^"]+)"/.exec(attrs)?.[1];
    const text = decodeXml(body.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }

    segments.push({
      start_ms: start ? Math.round(Number(start)) : 0,
      duration_ms: duration ? Math.round(Number(duration)) : null,
      text
    });
  }

  return segments;
}

function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/g);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timestampIndex = lines.findIndex((line) => line.includes("-->"));
    if (timestampIndex < 0) {
      continue;
    }

    const start = lines[timestampIndex].split("-->")[0]?.trim();
    const text = lines
      .slice(timestampIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      continue;
    }

    segments.push({
      start_ms: start ? parseVttTimestamp(start) : 0,
      duration_ms: null,
      text
    });
  }

  return collapseOverlappingSegments(segments);
}

function collapseOverlappingSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const collapsed: TranscriptSegment[] = [];
  let contextTokens: string[] = [];
  const maxContextTokens = 120;

  for (const segment of segments) {
    const currentTokens = splitTranscriptTokens(segment.text);
    if (currentTokens.length === 0) {
      continue;
    }

    const overlap = commonSuffixPrefixLength(contextTokens, currentTokens);
    const suffixTokens = currentTokens.slice(overlap);
    if (suffixTokens.length === 0) {
      continue;
    }

    collapsed.push({
      ...segment,
      text: suffixTokens.join(" ")
    });
    contextTokens = [...contextTokens, ...suffixTokens].slice(-maxContextTokens);
  }

  return collapsed;
}

function splitTranscriptTokens(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

function commonSuffixPrefixLength(previousTokens: string[], currentTokens: string[]): number {
  const max = Math.min(previousTokens.length, currentTokens.length);

  for (let length = max; length > 0; length -= 1) {
    let matches = true;
    for (let index = 0; index < length; index += 1) {
      if (normalizeTranscriptToken(previousTokens[previousTokens.length - length + index]) !== normalizeTranscriptToken(currentTokens[index])) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return length;
    }
  }

  return 0;
}

function normalizeTranscriptToken(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function parseVttTimestamp(value: string): number {
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return Math.round(seconds * 1000);
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
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

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function frontmatterValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return `\n${value.map((entry) => `  - ${JSON.stringify(entry)}`).join("\n")}`;
  }

  return JSON.stringify(value);
}

function buildRawMarkdown(input: {
  title: string;
  url: string;
  capturedAt: string;
  videoId: string;
  author?: string;
  captionLanguage: string;
  captionName: string;
  captionKind: string;
  segments: TranscriptSegment[];
}): string {
  const frontmatter: Record<string, string | string[]> = {
    title: input.title,
    source_kind: "web",
    captured_at: input.capturedAt,
    canonical_url: input.url,
    source: "youtube",
    youtube_video_id: input.videoId,
    language: input.captionLanguage,
    caption_track: input.captionName,
    caption_kind: input.captionKind || "manual",
    tags: ["youtube", "transcript", "telegram-ingest"]
  };

  if (input.author) {
    frontmatter.author = input.author;
  }

  const transcript = input.segments.map((segment) => `[${formatTimestamp(segment.start_ms)}] ${segment.text}`).join("\n");

  return `---\n${Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${frontmatterValue(value)}`)
    .join("\n")}\n---\n\n# ${input.title}\n\n## Source\n- URL: ${input.url}\n- YouTube video ID: ${input.videoId}\n- Caption track: ${input.captionName} (${input.captionLanguage}, ${input.captionKind || "manual"})\n\n## Transcript\n${transcript}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("youtube-transcript");
  const vaultRoot = resolveVaultRoot(args.vault);
  const input = await readJsonInput<InputPayload>(args.input);
  const url = stringValue(input.url);

  if (!url) {
    log.warn("youtube-transcript called without URL");
    writeJsonStdout({ status: "failed", reason: "Missing YouTube URL" } satisfies Result, args.pretty);
    return;
  }

  log.info({ url }, "youtube-transcript started");

  const videoIdFromUrl = extractVideoId(url);
  if (!videoIdFromUrl) {
    log.warn({ url }, "youtube-transcript: unsupported URL format");
    writeJsonStdout({ status: "failed", reason: "URL is not a supported YouTube video URL", url } satisfies Result, args.pretty);
    return;
  }

  log.info({ video_id: videoIdFromUrl }, "loading yt-dlp metadata");
  const info = await loadYtDlpInfo(url);
  if (!info) {
    log.error({ url, video_id: videoIdFromUrl }, "youtube-transcript: yt-dlp metadata load failed");
    writeJsonStdout({ status: "failed", reason: "Could not load YouTube metadata with yt-dlp", url, video_id: videoIdFromUrl } satisfies Result, args.pretty);
    return;
  }

  const videoId = stringValue(info.id) ?? videoIdFromUrl;
  const candidates = subtitleCandidatesFromInfo(info);
  if (candidates.length === 0) {
    writeJsonStdout({ status: "failed", reason: "YouTube video has no captions or subtitles", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const orderedSubtitles = orderSubtitleCandidates(candidates, normalizeLanguagePreferences(input.language_preferences));
  if (orderedSubtitles.length === 0) {
    writeJsonStdout({ status: "failed", reason: "YouTube video has no usable caption track", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const loadedSubtitle = await loadFirstUsableSubtitle(url, orderedSubtitles);
  if (!loadedSubtitle) {
    writeJsonStdout({ status: "failed", reason: "YouTube caption tracks are empty or unavailable", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }
  const selectedSubtitle = loadedSubtitle.candidate;
  const segments = loadedSubtitle.segments;

  const capturedAt = normalizeCapturedAt(input.captured_at);
  const title = stringValue(input.title) || stringValue(info.title) || `YouTube video ${videoId}`;
  const author = stringValue(info.uploader) || stringValue(info.channel);
  const canonicalUrl = stringValue(info.webpage_url) || url;
  const datePrefix = capturedAt.slice(0, 10);
  const slug = slugify(title, videoId);
  const hash = crypto.createHash("sha256").update(`${videoId}:${selectedSubtitle.language}:${selectedSubtitle.kind}:${segments.length}`).digest("hex").slice(0, 8);
  const rawPath = path.posix.join(SYSTEM_CONFIG.paths.rawDir, "web", `${datePrefix}-youtube-${slug}-${hash}.md`);
  const markdown = buildRawMarkdown({
    title,
    url: canonicalUrl,
    capturedAt,
    videoId,
    author,
    captionLanguage: selectedSubtitle.language,
    captionName: selectedSubtitle.name,
    captionKind: selectedSubtitle.kind,
    segments
  });

  await writeTextFile(resolveWithinRoot(vaultRoot, rawPath), markdown);

  log.info({ video_id: videoId, raw_path: rawPath }, "youtube-transcript completed");
  writeJsonStdout(
    {
      status: "created",
      raw_path: rawPath,
      title,
      video_id: videoId,
      url: canonicalUrl,
      captured_at: capturedAt,
      caption_language: selectedSubtitle.language,
      caption_name: selectedSubtitle.name,
      caption_kind: selectedSubtitle.kind,
      segment_count: segments.length,
      character_count: segments.reduce((total, segment) => total + segment.text.length, 0)
    } satisfies Result,
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
