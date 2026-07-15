import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtractionError, emptyContent } from './errors.js';

export function isYoutubeUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'youtu.be';
  } catch {
    return false;
  }
}

// Parse SRT into one text line per cue: strip cue numbers, timestamps, join
// multi-line cues with a space, and deduplicate overlapping YouTube auto-sub windows.
export function srtToPlainText(srtContent) {
  const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/;
  const CUE_NUMBER_RE = /^\d+$/;

  const cues = [];
  let current = [];

  const flushCue = () => {
    if (!current.length) return;
    const text = current.join(' ');
    const recent = cues.slice(-10).join(' ');
    if (!recent.includes(text)) cues.push(text);
    current = [];
  };

  for (const line of srtContent.split('\n')) {
    const t = line.trim();
    if (!t) { flushCue(); continue; }
    if (TIMESTAMP_RE.test(t) || CUE_NUMBER_RE.test(t)) continue;
    current.push(t);
  }
  flushCue();

  return cues.join('\n');
}

export function srtToMarkdown(srtContent, title) {
  const list = srtToPlainText(srtContent).split('\n').filter(Boolean).map((l) => `- ${l}`).join('\n');
  return `# ${title}\n\n${list}\n`;
}

const BASE_ARGS = [
  '--write-info-json',
  '--skip-download',
  '--sub-format', 'srt',
  '--no-playlist',
  '--js-runtimes', 'node:/usr/local/bin/node',
  '--extractor-retries', '3',
];

function isRateLimited(err) {
  return /429|too many requests/i.test(err?.message ?? '');
}

async function spawnYtDlp(args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new ExtractionError('timeout', 504, 'yt-dlp exceeded the timeout'));
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: stdout.trim() });
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runYtDlp(extraArgs, outPath, url, ytDlp) {
  await ytDlp([...BASE_ARGS, ...extraArgs, '-o', outPath, url]);
}

async function runYtDlpWithRetry(extraArgs, outPath, url, ytDlp, retryDelayMs = 5_000) {
  try {
    await runYtDlp(extraArgs, outPath, url, ytDlp);
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    if (!isRateLimited(err)) throw err;
    // 429: back off and retry with android_vr (different subtitle endpoint, no PO token needed)
    await new Promise((res) => setTimeout(res, retryDelayMs));
    const retryArgs = extraArgs.map((a) => a.replace('player_client=android', 'player_client=android_vr'));
    await runYtDlp(retryArgs, outPath, url, ytDlp);
  }
}


// opts._ytDlp is injectable for testing (replaces the real spawnYtDlp).
// opts._retryDelayMs overrides the 429-retry sleep (use 0 in tests).
export async function fetchYoutubeTranscript(url, { _ytDlp = spawnYtDlp, _retryDelayMs = 5_000 } = {}) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'yt-'));
  try {
    const outPath = join(tmpDir, '%(id)s');
    let lastError;

    // Pass 1: manual subtitles. android client works without PO tokens.
    // Pass 2: auto-generated English subtitles; retries on 429 with android_vr (different subtitle endpoint).
    const ANDROID = ['--extractor-args', 'youtube:player_client=android'];
    const passes = [
      { args: [...ANDROID, '--write-subs', '--sub-langs', 'en,es,es-ES,pt,pt-BR,fr,de,ja,ko,zh-Hans,zh-Hant'], retry: false },
      { args: [...ANDROID, '--write-auto-subs', '--write-subs', '--sub-langs', 'en'], retry: true },
    ];

    for (const { args: extraArgs, retry } of passes) {
      try {
        if (retry) {
          await runYtDlpWithRetry(extraArgs, outPath, url, _ytDlp, _retryDelayMs);
        } else {
          await runYtDlp(extraArgs, outPath, url, _ytDlp);
        }
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        lastError = err;
      }
      const found = (await readdir(tmpDir)).filter((f) => f.endsWith('.srt'));
      if (found.length) break;
    }

    const files = (await readdir(tmpDir)).filter((f) => f.endsWith('.srt'));
    if (!files.length) {
      const msg = lastError ? `Could not download subtitles: ${lastError.message}` : 'No subtitles available for this video';
      throw lastError ? new ExtractionError('extraction_failed', 422, msg) : emptyContent(msg);
    }

    const srtContent = await readFile(join(tmpDir, files[0]), 'utf8');

    let title = 'Video';
    const infoFiles = (await readdir(tmpDir)).filter((f) => f.endsWith('.info.json'));
    if (infoFiles.length) {
      try {
        const info = JSON.parse(await readFile(join(tmpDir, infoFiles[0]), 'utf8'));
        title = info.title || title;
      } catch { /* keep default */ }
    }

    const parsedUrl = new URL(url);
    const videoId =
      parsedUrl.hostname === 'youtu.be'
        ? parsedUrl.pathname.slice(1)
        : (parsedUrl.searchParams.get('v') ?? '');
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    return { srtContent, title, videoUrl };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
