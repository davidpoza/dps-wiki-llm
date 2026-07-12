import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractFromHtml, extractFromPdf } from '../src/extract.js';
import { ExtractionError, emptyContent, unsupportedContentType } from '../src/errors.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const fixtureBuf = (name) => readFileSync(join(here, 'fixtures', name));
const FINAL_URL = 'https://example.com/articulo?ref=x';

test('preserves block structure and inline formatting', () => {
  const { markdown } = extractFromHtml(fixture('article.html'), FINAL_URL);
  assert.match(markdown, /# Guía de extracción de contenido|## Pasos principales/);
  assert.match(markdown, /-\s+Primer elemento/); // unordered list
  assert.match(markdown, /1\.\s+Paso uno/); // ordered list
  assert.match(markdown, /> Una cita en bloque/); // blockquote
  assert.match(markdown, /```/); // fenced code block
  assert.match(markdown, /\| Clave \| Valor \|/); // gfm table
});

test('strips boilerplate (nav, aside, footer)', () => {
  const { markdown } = extractFromHtml(fixture('article.html'), FINAL_URL);
  assert.doesNotMatch(markdown, /Inicio · Blog · Contacto/);
  assert.doesNotMatch(markdown, /Publicidad y enlaces relacionados/);
  assert.doesNotMatch(markdown, /todos los derechos reservados/);
});

test('absolutizes relative links and images', () => {
  const { markdown } = extractFromHtml(fixture('article.html'), FINAL_URL);
  assert.match(markdown, /\]\(https:\/\/example\.com\/enlace-relativo\)/);
  assert.match(markdown, /https:\/\/example\.com\/imagenes\/diagrama\.png/);
});

test('captures metadata with high confidence', () => {
  const { metadata } = extractFromHtml(fixture('article.html'), FINAL_URL);
  assert.equal(metadata.finalUrl, FINAL_URL);
  assert.equal(metadata.canonicalUrl, 'https://example.com/articulo-canonico');
  assert.equal(metadata.siteName, 'Example Docs');
  assert.equal(metadata.author, 'Ada Lovelace');
  assert.equal(metadata.lang, 'es');
  assert.equal(metadata.extractionConfidence, 'high');
});

test('falls back to whole-body with low confidence on thin content', () => {
  const { markdown, metadata } = extractFromHtml(fixture('thin.html'), 'https://example.com/spa');
  assert.equal(metadata.extractionConfidence, 'low');
  assert.ok(markdown.length > 0);
});

test('throws empty_content when nothing extractable', () => {
  assert.throws(
    () => extractFromHtml('<!DOCTYPE html><html><body></body></html>', 'https://example.com/'),
    (err) => err instanceof ExtractionError && err.code === 'empty_content',
  );
});

test('typed error helpers carry code and status', () => {
  assert.equal(emptyContent().status, 422);
  assert.equal(unsupportedContentType('application/pdf').code, 'unsupported_content_type');
  assert.equal(unsupportedContentType('application/pdf').status, 415);
});

// --- PDF extraction tests ---

test('extractFromPdf extracts text and metadata from a valid PDF', async () => {
  const buf = fixtureBuf('sample.pdf');
  const { markdown, metadata } = await extractFromPdf(buf);
  assert.match(markdown, /Hello PDF fixture/);
  assert.equal(metadata.pages, 1);
  assert.equal(metadata.extractionConfidence, 'high');
});

test('extractFromPdf populates source and filename from opts', async () => {
  const buf = fixtureBuf('sample.pdf');
  const { metadata } = await extractFromPdf(buf, { source: 'upload', filename: 'test.pdf' });
  assert.equal(metadata.source, 'upload');
  assert.equal(metadata.filename, 'test.pdf');
});

test('extractFromPdf throws empty_content for a PDF with no text', async () => {
  // Build a minimal PDF with an empty content stream.
  const empty = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n' +
    'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF\n',
    'latin1',
  );
  await assert.rejects(
    () => extractFromPdf(empty),
    (err) => err instanceof ExtractionError && err.code === 'empty_content',
  );
});
