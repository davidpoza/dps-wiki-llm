import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import FormData from 'form-data';
import { buildApp, validateUrl } from '../src/server.js';
import { ExtractionError } from '../src/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const pdfFixture = readFileSync(join(here, 'fixtures', 'sample.pdf'));

test('validateUrl rejects missing, malformed and non-http(s) urls', () => {
  assert.throws(() => validateUrl({}), (e) => e instanceof ExtractionError && e.code === 'invalid_url');
  assert.throws(() => validateUrl({ url: 'not a url' }), (e) => e.code === 'invalid_url');
  assert.throws(() => validateUrl({ url: 'ftp://example.com' }), (e) => e.code === 'invalid_url');
  assert.equal(validateUrl({ url: 'https://example.com/x' }), 'https://example.com/x');
});

test('POST /extract with an invalid url returns 400 before any navigation', async () => {
  const app = buildApp({ logger: false });
  const res = await app.inject({ method: 'POST', url: '/extract', payload: { url: 'ftp://nope' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_url');
  await app.close();
});

test('GET /health reports 503 while the browser is not started', async () => {
  const app = buildApp({ logger: false });
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().status, 'starting');
  await app.close();
});

// --- /extract/file tests ---

test('POST /extract/file returns 200 with markdown for a valid PDF upload', async () => {
  const app = buildApp({ logger: false });
  const form = new FormData();
  form.append('file', pdfFixture, { filename: 'sample.pdf', contentType: 'application/pdf' });
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.markdown.includes('Hello PDF fixture'));
  assert.equal(body.metadata.source, 'upload');
  assert.equal(body.metadata.filename, 'sample.pdf');
  assert.equal(body.metadata.pages, 1);
  await app.close();
});

test('POST /extract/file returns 200 with content for a valid markdown upload', async () => {
  const app = buildApp({ logger: false });
  const mdContent = '# Hello\n\nSome **markdown** content.';
  const form = new FormData();
  form.append('file', Buffer.from(mdContent), { filename: 'doc.md', contentType: 'text/markdown' });
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.markdown, mdContent);
  assert.equal(body.metadata.source, 'upload');
  assert.equal(body.metadata.filename, 'doc.md');
  assert.equal(body.metadata.extractionConfidence, 'high');
  await app.close();
});

test('POST /extract/file accepts .md with text/plain mime type', async () => {
  const app = buildApp({ logger: false });
  const mdContent = '# Plain text mime\n\nStill valid markdown.';
  const form = new FormData();
  form.append('file', Buffer.from(mdContent), { filename: 'notes.md', contentType: 'text/plain' });
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().markdown, mdContent);
  await app.close();
});

test('POST /extract/file returns 400 when no file field is sent', async () => {
  const app = buildApp({ logger: false });
  const form = new FormData();
  form.append('other', 'value');
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_input');
  await app.close();
});

test('POST /extract/file returns 400 when file type is unsupported', async () => {
  const app = buildApp({ logger: false });
  const form = new FormData();
  form.append('file', Buffer.from('<html></html>'), { filename: 'page.html', contentType: 'text/html' });
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, 'invalid_input');
  await app.close();
});

test('POST /extract/file returns 413 when PDF exceeds size limit', async () => {
  const origMax = process.env.PDF_MAX_BYTES;
  process.env.PDF_MAX_BYTES = '10'; // 10 bytes — smaller than any real PDF
  // Re-import config with new env value by rebuilding app with patched config
  const { config } = await import('../src/config.js');
  const savedMax = config.pdfMaxBytes;
  config.pdfMaxBytes = 10;

  const app = buildApp({ logger: false });
  const form = new FormData();
  form.append('file', pdfFixture, { filename: 'big.pdf', contentType: 'application/pdf' });
  const res = await app.inject({
    method: 'POST',
    url: '/extract/file',
    payload: form.getBuffer(),
    headers: form.getHeaders(),
  });
  assert.equal(res.statusCode, 413);
  assert.equal(res.json().error, 'payload_too_large');

  config.pdfMaxBytes = savedMax;
  if (origMax === undefined) delete process.env.PDF_MAX_BYTES;
  else process.env.PDF_MAX_BYTES = origMax;
  await app.close();
});
