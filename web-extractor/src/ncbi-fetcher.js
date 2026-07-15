import { JSDOM } from 'jsdom';
import { emptyContent } from './errors.js';

const PMC_PATTERN = /^https?:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/(PMC\d+)/i;
const NCBI_EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

export function isPmcUrl(url) {
  return PMC_PATTERN.test(url);
}

function extractPmcId(url) {
  return url.match(PMC_PATTERN)?.[1] ?? null;
}

export async function fetchPmcArticle(url) {
  const pmcId = extractPmcId(url);
  const apiUrl = `${NCBI_EFETCH}?db=pmc&id=${pmcId}&rettype=xml&retmode=xml`;

  const resp = await fetch(apiUrl, {
    headers: { 'User-Agent': 'dps-wiki-llm/1.0 (research-knowledge-tool)' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) throw new Error(`NCBI API returned ${resp.status} for ${pmcId}`);

  const xml = await resp.text();
  return parseJats(xml, url);
}

function nodeText(el) {
  return el?.textContent?.trim() ?? '';
}

function parseJats(xml, sourceUrl) {
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  const doc = dom.window.document;

  const title = nodeText(doc.querySelector('article-title')) || sourceUrl;

  const authors = Array.from(doc.querySelectorAll('contrib[contrib-type="author"] name'))
    .map((n) =>
      [nodeText(n.querySelector('given-names')), nodeText(n.querySelector('surname'))]
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean);

  // Prefer electronic pub date, fall back to any pub-date
  const pubDate =
    doc.querySelector('pub-date[pub-type="epub"]') ||
    doc.querySelector('pub-date[publication-type="epub"]') ||
    doc.querySelector('pub-date');
  const year = nodeText(pubDate?.querySelector('year'));
  const month = nodeText(pubDate?.querySelector('month'));
  const day = nodeText(pubDate?.querySelector('day'));
  const published = [year, month, day].filter(Boolean).join('-') || null;

  const journal = nodeText(doc.querySelector('journal-title')) || null;
  const doi = nodeText(doc.querySelector('article-id[pub-id-type="doi"]')) || null;
  const canonicalUrl = doi ? `https://doi.org/${doi}` : sourceUrl;

  const parts = [];

  const abstractEl = doc.querySelector('abstract');
  if (abstractEl) {
    parts.push('## Abstract\n\n' + jatsToMd(abstractEl, 3));
  }

  const bodyEl = doc.querySelector('body');
  if (bodyEl) {
    parts.push(jatsToMd(bodyEl, 2));
  }

  const markdown = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!markdown) throw emptyContent('NCBI returned no extractable content for this article');

  const metadata = {
    finalUrl: sourceUrl,
    canonicalUrl,
    title,
    author: authors.join(', ') || null,
    published,
    siteName: journal,
    lang: 'en',
    extractionConfidence: 'high',
  };

  return { markdown, metadata };
}

// Recursively convert JATS XML elements to markdown text.
function jatsToMd(el, depth) {
  const lines = [];
  for (const child of el.children) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'title') {
      const t = nodeText(child);
      if (t) lines.push('#'.repeat(Math.min(depth, 6)) + ' ' + t + '\n');
    } else if (tag === 'sec') {
      lines.push(jatsToMd(child, depth + 1));
    } else if (tag === 'p') {
      const t = nodeText(child);
      if (t) lines.push(t + '\n');
    } else if (tag === 'list') {
      for (const item of child.querySelectorAll('list-item')) {
        const t = nodeText(item.querySelector('p') ?? item);
        if (t) lines.push('- ' + t);
      }
      lines.push('');
    } else if (tag === 'table-wrap') {
      const caption = nodeText(child.querySelector('caption'));
      if (caption) lines.push('*Table: ' + caption + '*\n');
    } else if (tag === 'fig') {
      const caption = nodeText(child.querySelector('caption'));
      if (caption) lines.push('*Figure: ' + caption + '*\n');
    } else if (tag === 'disp-formula' || tag === 'inline-formula') {
      const t = nodeText(child);
      if (t) lines.push('`' + t + '`');
    } else if (tag === 'boxed-text') {
      lines.push(jatsToMd(child, depth + 1));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
