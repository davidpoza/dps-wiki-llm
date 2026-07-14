import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isYoutubeUrl, srtToMarkdown, srtToPlainText, fetchYoutubeTranscript } from '../src/youtube-fetcher.js';
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

// --- srtToPlainText ---

test('srtToPlainText strips timestamps and cue numbers', () => {
  const text = srtToPlainText(SAMPLE_SRT);
  assert.ok(!text.includes('00:00:00,474'));
  assert.ok(!text.match(/^\d+$/m));
  assert.match(text, /10,000 tool changes\./);
  assert.match(text, /I've been counting/);
});

test('srtToPlainText returns one line per cue, joining multi-line cues with space', () => {
  const text = srtToPlainText(SAMPLE_SRT);
  const lines = text.split('\n');
  // SAMPLE_SRT has 3 cues; cues 2 and 3 each have 2 text lines → joined to 1
  assert.equal(lines.length, 3);
  assert.match(lines[1], /I've been counting.*100-plus hours/);
  assert.match(lines[2], /Prusa Core One Index.*Founder's Edition/);
});

test('srtToPlainText deduplicates overlapping YouTube auto-sub windows', () => {
  const overlapping = `1\n00:00:00,000 --> 00:00:02,000\nhello world\n\n2\n00:00:01,000 --> 00:00:03,000\nhello world\n\n3\n00:00:02,000 --> 00:00:04,000\nnew text\n`;
  const text = srtToPlainText(overlapping);
  // "hello world" should appear only once
  assert.equal(text.split('hello world').length - 1, 1);
  assert.match(text, /new text/);
});

// --- srtToMarkdown ---

test('srtToMarkdown produces H1 followed by a markdown list (no timestamps)', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'My Test Video');
  assert.ok(md.startsWith('# My Test Video\n\n'));
  assert.ok(!md.includes('00:00:00,474'));
  assert.match(md, /^- 10,000 tool changes\./m);
});

test('srtToMarkdown strips cue numbers, timestamps and uses bullet list', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'Test');
  assert.ok(!md.match(/^\d+$/m));
  assert.ok(!md.includes('-->'));
  assert.match(md, /^- /m);
});

test('srtToMarkdown includes full transcript text', () => {
  const md = srtToMarkdown(SAMPLE_SRT, 'Test');
  assert.match(md, /I've been counting/);
  assert.match(md, /100-plus hours of torture testing/);
  assert.match(md, /Founder's Edition/);
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

test('fetchYoutubeTranscript retries on 429 and succeeds with SRT from retry', async () => {
  let callCount = 0;
  const mockYtDlp = async (args) => {
    callCount += 1;
    // First call (pass 1 manual subs): succeeds but writes no SRT
    if (callCount === 1) return { stdout: '' };
    // Second call (pass 2 first attempt): simulates YouTube 429
    if (callCount === 2) throw new Error('HTTP Error 429: Too Many Requests');
    // Third call (pass 2 retry after back-off): succeeds and writes SRT
    const oIdx = args.indexOf('-o');
    const tmpDir = args[oIdx + 1].replace(/\/[^/]+$/, '');
    writeFileSync(join(tmpDir, 'abc.en.srt'), SAMPLE_SRT);
    writeFileSync(join(tmpDir, 'abc.info.json'), JSON.stringify({ title: 'Rate Limited Video' }));
    return { stdout: '' };
  };

  const { title, srtContent } = await fetchYoutubeTranscript(
    'https://www.youtube.com/watch?v=abc',
    { _ytDlp: mockYtDlp, _retryDelayMs: 0 },
  );

  assert.equal(title, 'Rate Limited Video');
  assert.match(srtContent, /10,000 tool changes\./);
  assert.equal(callCount, 3);
});

test('fetchYoutubeTranscript throws extraction_failed when retry also fails on 429', async () => {
  const mockYtDlp = async () => { throw new Error('HTTP Error 429: Too Many Requests'); };

  await assert.rejects(
    () => fetchYoutubeTranscript('https://www.youtube.com/watch?v=abc', { _ytDlp: mockYtDlp, _retryDelayMs: 0 }),
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
