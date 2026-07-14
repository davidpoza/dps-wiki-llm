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

// opts._ytDlp is injectable for testing (replaces the real spawnYtDlp).
export async function fetchYoutubeTranscript(url, { _ytDlp = spawnYtDlp } = {}) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'yt-'));
  try {
    try {
      await _ytDlp([
        '--write-auto-subs',
        '--write-subs',
        '--write-info-json',
        '--skip-download',
        '--sub-format', 'srt',
        '--sub-langs', 'en',
        '--no-playlist',
        '-o', join(tmpDir, '%(id)s'),
        url,
      ]);
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError('extraction_failed', 422, `Could not download subtitles: ${err.message}`);
    }

    const files = (await readdir(tmpDir)).filter((f) => f.endsWith('.srt'));
    if (!files.length) {
      throw emptyContent('No subtitles available for this video');
    }

    const srtContent = await readFile(join(tmpDir, files[0]), 'utf8');

    // Read title from the info JSON yt-dlp writes alongside the subtitle.
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
