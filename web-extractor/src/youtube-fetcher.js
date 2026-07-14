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

export function srtToMarkdown(srtContent, title) {
  return `# ${title}\n\n${srtContent.trim()}\n`;
}

const BASE_ARGS = [
  '--write-info-json',
  '--skip-download',
  '--sub-format', 'srt',
  '--no-playlist',
  '--impersonate', 'chrome',
  '--js-runtimes', 'node:/usr/local/bin/node',
  '--extractor-retries', '3',
];

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

// opts._ytDlp is injectable for testing (replaces the real spawnYtDlp).
export async function fetchYoutubeTranscript(url, { _ytDlp = spawnYtDlp } = {}) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'yt-'));
  try {
    const outPath = join(tmpDir, '%(id)s');
    let lastError;

    // Pass 1: manual subtitles in any common language (avoids auto-generated rate limits).
    // Pass 2: auto-generated English subtitles (most English videos).
    const passes = [
      ['--write-subs', '--sub-langs', 'en,es,es-ES,pt,pt-BR,fr,de,ja,ko,zh-Hans,zh-Hant'],
      ['--write-auto-subs', '--write-subs', '--sub-langs', 'en'],
    ];

    for (const extraArgs of passes) {
      try {
        await runYtDlp(extraArgs, outPath, url, _ytDlp);
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
