#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import type { JsonObject } from "./lib/contracts.js";
import { resolveVaultRoot, resolveWithinRoot, writeTextFile } from "./lib/fs-utils.js";

type CaptionTrack = {
  baseUrl?: string;
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
  languageCode?: string;
  kind?: string;
  vssId?: string;
};

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
  player_response?: unknown;
  transcript_json?: unknown;
  watch_html?: string;
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

function titleFromPlayerResponse(playerResponse: unknown): string | undefined {
  if (!isRecord(playerResponse)) {
    return undefined;
  }

  const details = playerResponse.videoDetails;
  if (!isRecord(details)) {
    return undefined;
  }

  return stringValue(details.title);
}

function authorFromPlayerResponse(playerResponse: unknown): string | undefined {
  if (!isRecord(playerResponse)) {
    return undefined;
  }

  const details = playerResponse.videoDetails;
  if (!isRecord(details)) {
    return undefined;
  }

  return stringValue(details.author);
}

function captionTracksFromPlayerResponse(playerResponse: unknown): CaptionTrack[] {
  if (!isRecord(playerResponse)) {
    return [];
  }

  const captions = playerResponse.captions;
  if (!isRecord(captions)) {
    return [];
  }

  const tracklist = captions.playerCaptionsTracklistRenderer;
  if (!isRecord(tracklist)) {
    return [];
  }

  const tracks = tracklist.captionTracks;
  return Array.isArray(tracks) ? tracks.filter(isRecord) : [];
}

function labelFromTrack(track: CaptionTrack): string {
  const name = track.name;
  if (!name) {
    return track.languageCode || "unknown";
  }

  if (typeof name.simpleText === "string") {
    return name.simpleText;
  }

  if (Array.isArray(name.runs)) {
    return name.runs.map((run) => run.text ?? "").join("").trim() || track.languageCode || "unknown";
  }

  return track.languageCode || "unknown";
}

function selectCaptionTrack(tracks: CaptionTrack[], languagePreferences: string[]): CaptionTrack | null {
  const usable = tracks.filter((track) => stringValue(track.baseUrl));
  if (usable.length === 0) {
    return null;
  }

  const normalizedPreferences = languagePreferences.map((language) => language.toLowerCase());
  for (const language of normalizedPreferences) {
    const exactManual = usable.find(
      (track) => track.languageCode?.toLowerCase() === language && track.kind !== "asr"
    );
    if (exactManual) {
      return exactManual;
    }

    const exactAny = usable.find((track) => track.languageCode?.toLowerCase() === language);
    if (exactAny) {
      return exactAny;
    }
  }

  return usable.find((track) => track.kind !== "asr") ?? usable[0] ?? null;
}

function parsePlayerResponseFromHtml(html: string): unknown | null {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const braceStart = html.indexOf("{", markerIndex);
  if (braceStart < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = braceStart; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(html.slice(braceStart, index + 1));
      }
    }
  }

  return null;
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

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

function withFormat(url: string, format: "json3" | "srv3"): string {
  const parsed = new URL(url);
  parsed.searchParams.set("fmt", format);
  return parsed.toString();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "dps-wiki-llm/0.1 youtube-transcript"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.text();
}

async function loadPlayerResponse(input: InputPayload, videoId: string): Promise<unknown | null> {
  if (input.player_response) {
    return input.player_response;
  }

  const html = input.watch_html ?? (await fetchText(`https://www.youtube.com/watch?v=${videoId}`));
  return parsePlayerResponseFromHtml(html);
}

async function loadTranscript(input: InputPayload, track: CaptionTrack): Promise<TranscriptSegment[]> {
  if (input.transcript_json) {
    return parseTranscriptJson(input.transcript_json);
  }

  const baseUrl = stringValue(track.baseUrl);
  if (!baseUrl) {
    return [];
  }

  const jsonText = await fetchText(withFormat(baseUrl, "json3"));
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const segments = parseTranscriptJson(parsed);
    if (segments.length > 0) {
      return segments;
    }
  } catch {
    // Fall through to XML parsing. YouTube may ignore fmt=json3 for some tracks.
  }

  return parseTranscriptXml(jsonText);
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
  const vaultRoot = resolveVaultRoot(args.vault);
  const input = await readJsonInput<InputPayload>(args.input);
  const url = stringValue(input.url);

  if (!url) {
    writeJsonStdout({ status: "failed", reason: "Missing YouTube URL" } satisfies Result, args.pretty);
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    writeJsonStdout({ status: "failed", reason: "URL is not a supported YouTube video URL", url } satisfies Result, args.pretty);
    return;
  }

  const playerResponse = await loadPlayerResponse(input, videoId);
  if (!playerResponse) {
    writeJsonStdout({ status: "failed", reason: "Could not load YouTube player metadata", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const tracks = captionTracksFromPlayerResponse(playerResponse);
  if (tracks.length === 0) {
    writeJsonStdout({ status: "failed", reason: "YouTube video has no captions or subtitles", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const track = selectCaptionTrack(tracks, input.language_preferences ?? ["en", "es"]);
  if (!track) {
    writeJsonStdout({ status: "failed", reason: "YouTube video has no usable caption track", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const segments = await loadTranscript(input, track);
  if (segments.length === 0) {
    writeJsonStdout({ status: "failed", reason: "Selected YouTube caption track is empty", url, video_id: videoId } satisfies Result, args.pretty);
    return;
  }

  const capturedAt = normalizeCapturedAt(input.captured_at);
  const title = stringValue(input.title) || titleFromPlayerResponse(playerResponse) || `YouTube video ${videoId}`;
  const author = authorFromPlayerResponse(playerResponse);
  const datePrefix = capturedAt.slice(0, 10);
  const slug = slugify(title, videoId);
  const hash = crypto.createHash("sha256").update(`${videoId}:${track.languageCode ?? ""}:${segments.length}`).digest("hex").slice(0, 8);
  const rawPath = path.posix.join(SYSTEM_CONFIG.paths.rawDir, "web", `${datePrefix}-youtube-${slug}-${hash}.md`);
  const markdown = buildRawMarkdown({
    title,
    url,
    capturedAt,
    videoId,
    author,
    captionLanguage: track.languageCode || "unknown",
    captionName: labelFromTrack(track),
    captionKind: track.kind || "manual",
    segments
  });

  await writeTextFile(resolveWithinRoot(vaultRoot, rawPath), markdown);

  writeJsonStdout(
    {
      status: "created",
      raw_path: rawPath,
      title,
      video_id: videoId,
      url,
      captured_at: capturedAt,
      caption_language: track.languageCode || "unknown",
      caption_name: labelFromTrack(track),
      caption_kind: track.kind || "manual",
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
