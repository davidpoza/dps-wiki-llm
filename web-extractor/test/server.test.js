import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, validateUrl } from '../src/server.js';
import { ExtractionError } from '../src/errors.js';

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
