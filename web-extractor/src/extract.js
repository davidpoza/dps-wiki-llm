import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
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
