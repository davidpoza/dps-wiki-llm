import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { PDFParse, VerbosityLevel } from 'pdf-parse';
import { config } from './config.js';
import { extractMetadata } from './metadata.js';
import { emptyContent } from './errors.js';

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  td.use(gfm);
  return td;
}

// Rewrite relative href/src attributes to absolute URLs against `baseUrl`.
function absolutize(fragmentDoc, baseUrl) {
  for (const a of fragmentDoc.querySelectorAll('a[href]')) {
    try {
      a.setAttribute('href', new URL(a.getAttribute('href'), baseUrl).href);
    } catch {
      /* leave as-is */
    }
  }
  for (const img of fragmentDoc.querySelectorAll('img[src]')) {
    try {
      img.setAttribute('src', new URL(img.getAttribute('src'), baseUrl).href);
    } catch {
      /* leave as-is */
    }
  }
}

function htmlToMarkdown(html, baseUrl) {
  const dom = new JSDOM(`<body>${html}</body>`, { url: baseUrl });
  absolutize(dom.window.document, baseUrl);
  return makeTurndown().turndown(dom.window.document.body.innerHTML).trim();
}

/**
 * Extract structured markdown + metadata from rendered HTML.
 * Pure over its inputs (no browser) so it is directly unit-testable.
 *
 * @param {string} renderedHtml full rendered DOM HTML
 * @param {string} finalUrl resolved URL after redirects (used as base + source)
 * @returns {{ markdown: string, metadata: object }}
 */
export function extractFromHtml(renderedHtml, finalUrl) {
  const dom = new JSDOM(renderedHtml, { url: finalUrl });
  const doc = dom.window.document;
  const metadata = extractMetadata(doc, finalUrl);

  // Readability mutates the document, so clone for isolation.
  const readerDoc = dom.window.document.cloneNode(true);
  let article = null;
  try {
    article = new Readability(readerDoc).parse();
  } catch {
    article = null;
  }

  let markdown = '';
  let confidence = 'high';

  if (article && article.content && (article.textContent ?? '').trim().length >= config.minContentChars) {
    markdown = htmlToMarkdown(article.content, finalUrl);
    metadata.title ??= article.title ?? null;
    if (article.byline) metadata.author ??= article.byline;
    if (article.siteName) metadata.siteName ??= article.siteName;
    if (article.lang) metadata.lang ??= article.lang;
  } else {
    // Fallback: convert the whole body and flag low confidence.
    confidence = 'low';
    const body = doc.body ? doc.body.innerHTML : '';
    markdown = htmlToMarkdown(body, finalUrl);
  }

  if (!markdown || markdown.trim().length === 0) {
    throw emptyContent();
  }

  metadata.extractionConfidence = confidence;
  return { markdown, metadata };
}

/**
 * Extract structured markdown + metadata from a PDF buffer.
 *
 * @param {Buffer} buffer PDF file bytes
 * @param {{ source?: string, filename?: string }} [opts]
 * @returns {Promise<{ markdown: string, metadata: object }>}
 */
export async function extractFromPdf(buffer, opts = {}) {
  // pdfjs-dist (used internally by pdf-parse) needs to transfer the backing
  // ArrayBuffer across its internal LoopbackPort. Node.js Buffer shares its
  // ArrayBuffer with the allocator pool, making it non-transferable.
  // Slice it to produce an exclusive copy that can be transferred.
  const exclusiveAb = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const parser = new PDFParse({ data: new Uint8Array(exclusiveAb), verbosity: VerbosityLevel.ERRORS });
  // getText and getInfo both call load() which calls pdfjs.getDocument().
  // Calling them concurrently would issue two getDocument() calls, transferring
  // the same ArrayBuffer twice — the second transfer fails on the detached buffer.
  // Call sequentially so the document is cached after the first load() completes.
  let textResult, infoResult;
  try {
    textResult = await parser.getText();
    infoResult = await parser.getInfo();
  } finally {
    await parser.destroy();
  }

  const markdown = textResult.pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');

  if (!markdown) throw emptyContent();

  const metadata = {
    pages: textResult.total,
    title: infoResult.info?.Title || null,
    source: opts.source ?? null,
    filename: opts.filename ?? null,
    extractionConfidence: 'high',
  };

  return { markdown, metadata };
}
