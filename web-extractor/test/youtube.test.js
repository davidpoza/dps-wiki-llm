import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isYoutubeUrl, srtToMarkdown, fetchYoutubeTranscript } from '../src/youtube-fetcher.js';
import { ExtractionError } from '../src/errors.js';

const here = dirname(fileURLToPath(import.meta.url));

const SAMPLE_SRT = `1
00:00:00,474 --> 00:00:02,814
10,000 tool changes.

2
00:00:03,214 --> 00:00:07,484
I've been counting, and in the
100-plus hours of torture testing

3
00:00:07,513 --> 00:00:13,234
the eight-tool Prusa Core One Index
Founder's Edition, it hasn't missed once.
`;

// --- isYoutubeUrl ---

test('isYoutubeUrl returns true for youtube.com/watch URLs', () => {
  assert.ok(isYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(isYoutubeUrl('https://youtube.com/watch?v=abc123'));
});

test('isYoutubeUrl returns true for youtu.be short URLs', () => {
  assert.ok(isYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'));
});

test('isYoutubeUrl returns false for non-YouTube URLs', () => {
  assert.ok(!isYoutubeUrl('https://example.com/video'));
  assert.ok(!isYoutubeUrl('https://vimeo.com/123456'));
  assert.ok(!isYoutubeUrl('https://notyoutube.com/watch?v=abc'));
});

test('isYoutubeUrl returns false for malformed input', () => {
  assert.ok(!isYoutubeUrl('not-a-url'));
  assert.ok(!isYoutubeUrl(''));
});

// --- srtToMarkdown ---

test('srtToMarkdown produces H1 followed by SRT content', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'My Test Video');
  assert.ok(md.startsWith('# My Test Video\n\n'));
  assert.match(md, /00:00:00,474 --> 00:00:02,814/);
  assert.match(md, /10,000 tool changes\./);
});

test('srtToMarkdown preserves timestamps and cue numbers', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'Test');
  assert.match(md, /^1$/m);
  assert.match(md, /^2$/m);
  assert.match(md, /00:00:03,214 --> 00:00:07,484/);
});

test('srtToMarkdown preserves multi-line cue text', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'Test');
  assert.match(md, /I've been counting, and in the/);
  assert.match(md, /100-plus hours of torture testing/);
});

// --- fetchYoutubeTranscript (mocked yt-dlp) ---

test('fetchYoutubeTranscript returns srtContent, title and canonical videoUrl', async () => {
  const mockYtDlp = async (args) => {
    const oIdx = args.indexOf('-o');
    const tmpDir = args[oIdx + 1].replace(/\/[^/]+$/, '');
    writeFileSync(join(tmpDir, 'dQw4w9WgXcQ.en.srt'), SAMPLE_SRT);
    writeFileSync(join(tmpDir, 'dQw4w9WgXcQ.info.json'), JSON.stringify({ title: 'Never Gonna Give You Up' }));
    return { stdout: '' };
  };

  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const { srtContent, title, videoUrl } = await fetchYoutubeTranscript(url, { _ytDlp: mockYtDlp });

  assert.equal(title, 'Never Gonna Give You Up');
  assert.equal(videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.match(srtContent, /10,000 tool changes\./);
});

test('fetchYoutubeTranscript throws empty_content when no SRT files are written', async () => {
  const mockYtDlp = async () => ({ stdout: '' });

  await assert.rejects(
    () => fetchYoutubeTranscript('https://www.youtube.com/watch?v=abc', { _ytDlp: mockYtDlp }),
    (err) => err instanceof ExtractionError && err.code === 'empty_content',
  );
});

test('fetchYoutubeTranscript throws extraction_failed when yt-dlp exits non-zero', async () => {
  const mockYtDlp = async () => { throw new Error('Video unavailable'); };

  await assert.rejects(
    () => fetchYoutubeTranscript('https://www.youtube.com/watch?v=abc', { _ytDlp: mockYtDlp }),
    (err) => err instanceof ExtractionError && err.code === 'extraction_failed',
  );
});

test('fetchYoutubeTranscript derives canonical URL for youtu.be short links', async () => {
  const mockYtDlp = async (args) => {
    const oIdx = args.indexOf('-o');
    const tmpDir = args[oIdx + 1].replace(/\/[^/]+$/, '');
    writeFileSync(join(tmpDir, 'abc123.en.srt'), SAMPLE_SRT);
    writeFileSync(join(tmpDir, 'abc123.info.json'), JSON.stringify({ title: 'Short Link Video' }));
    return { stdout: '' };
  };

  const { videoUrl } = await fetchYoutubeTranscript('https://youtu.be/abc123', { _ytDlp: mockYtDlp });
  assert.equal(videoUrl, 'https://www.youtube.com/watch?v=abc123');
});
