import { JSDOM } from 'jsdom';
import { emptyContent } from './errors.js';

const PMC_PATTERN = /^https?:\/\/pmc\.ncbi\.nlm\.nih\.gov\/articles\/(PMC\d+)/i;
const PUBMED_PATTERN = /^https?:\/\/(?:www\.)?pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i;
const NCBI_EFETCH = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const NCBI_HEADERS = { 'User-Agent': 'dps-wiki-llm/1.0 (research-knowledge-tool)' };

// PubMed encodes languages as ISO 639-2/3 ("eng"); the rest of the system uses
// 2-letter codes. Map the common ones, fall back to the first two letters.
const LANG_MAP = { eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt' };

export function isPmcUrl(url) {
  return PMC_PATTERN.test(url);
}

export function isPubmedUrl(url) {
  return PUBMED_PATTERN.test(url);
}

function extractPmcId(url) {
  return url.match(PMC_PATTERN)?.[1] ?? null;
}

function extractPmid(url) {
  return url.match(PUBMED_PATTERN)?.[1] ?? null;
}

async function ncbiFetch(apiUrl, fetchImpl) {
  return fetchImpl(apiUrl, {
    headers: NCBI_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
}

/** Entry point for direct `pmc.ncbi.nlm.nih.gov` article URLs. */
export async function fetchPmcArticle(url, { _fetch } = {}) {
  const fetchImpl = _fetch ?? fetch;
  return fetchPmcById(extractPmcId(url), url, fetchImpl);
}

/**
 * Fetch a PMC full-text article by its PMCID via NCBI E-utilities `efetch`
 * (`db=pmc`) and convert the JATS XML to markdown. Shared by the direct PMC URL
 * path and the PubMed → open-access escalation.
 */
async function fetchPmcById(pmcId, sourceUrl, fetchImpl) {
  const apiUrl = `${NCBI_EFETCH}?db=pmc&id=${pmcId}&rettype=xml&retmode=xml`;
  const resp = await ncbiFetch(apiUrl, fetchImpl);
  if (!resp.ok) throw new Error(`NCBI API returned ${resp.status} for ${pmcId}`);
  const xml = await resp.text();
  return parseJats(xml, sourceUrl);
}

/**
 * Entry point for `pubmed.ncbi.nlm.nih.gov/<PMID>` URLs. Fetches the PubMed
 * record (abstract + metadata, available even for paywalled articles) and, when
 * the article has its own PMCID (open-access subset), escalates to the PMC
 * full text.
 */
export async function fetchPubmedArticle(url, { _fetch } = {}) {
  const fetchImpl = _fetch ?? fetch;
  const pmid = extractPmid(url);
  const apiUrl = `${NCBI_EFETCH}?db=pubmed&id=${pmid}&retmode=xml`;
  const resp = await ncbiFetch(apiUrl, fetchImpl);
  if (!resp.ok) throw new Error(`NCBI API returned ${resp.status} for PMID ${pmid}`);

  const xml = await resp.text();
  const parsed = parsePubmed(xml, url);

  // Open-access articles carry their own PMCID → prefer the full text.
  if (parsed.pmcId) {
    try {
      return await fetchPmcById(parsed.pmcId, url, fetchImpl);
    } catch (err) {
      // A PMC hiccup should not lose the abstract we already have.
      if (!parsed.markdown) throw err;
    }
  }

  if (!parsed.markdown) {
    throw emptyContent('PubMed returned no abstract for this article');
  }
  return { markdown: parsed.markdown, metadata: parsed.metadata };
}

function nodeText(el) {
  return el?.textContent?.trim() ?? '';
}

function normalizeLang(raw) {
  if (!raw) return null;
  const key = raw.toLowerCase();
  return LANG_MAP[key] ?? key.slice(0, 2);
}

/**
 * Parse a `db=pubmed` record into abstract markdown + metadata. Selectors are
 * scoped to the article's own nodes; the article's own PMCID/DOI live under
 * `PubmedData > ArticleIdList` (direct child), never the bibliography's
 * `<Reference>` id lists.
 */
function parsePubmed(xml, sourceUrl) {
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  const art = dom.window.document.querySelector('PubmedArticle');
  if (!art) return { pmcId: null, markdown: null, metadata: null };

  const title = nodeText(art.querySelector('MedlineCitation > Article > ArticleTitle')) || sourceUrl;
  const journal = nodeText(art.querySelector('MedlineCitation > Article > Journal > Title')) || null;
  const lang = normalizeLang(nodeText(art.querySelector('MedlineCitation > Article > Language')));

  const authors = Array.from(art.querySelectorAll('MedlineCitation > Article > AuthorList > Author'))
    .map((a) => {
      const collective = nodeText(a.querySelector('CollectiveName'));
      if (collective) return collective;
      return [nodeText(a.querySelector('ForeName')), nodeText(a.querySelector('LastName'))]
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean);

  const doi =
    nodeText(art.querySelector('PubmedData > ArticleIdList > ArticleId[IdType="doi"]')) ||
    nodeText(art.querySelector('MedlineCitation > Article > ELocationID[EIdType="doi"]')) ||
    null;
  const pmcId = nodeText(art.querySelector('PubmedData > ArticleIdList > ArticleId[IdType="pmc"]')) || null;

  const published = pubmedDate(art);
  const markdown = abstractToMarkdown(art);

  const metadata = {
    finalUrl: sourceUrl,
    canonicalUrl: doi ? `https://doi.org/${doi}` : sourceUrl,
    title,
    author: authors.join(', ') || null,
    published,
    siteName: journal,
    lang,
    extractionConfidence: 'medium',
  };

  return { pmcId, markdown, metadata };
}

// Prefer the numeric electronic ArticleDate; fall back to the (possibly
// textual) journal PubDate.
function pubmedDate(art) {
  const ad = art.querySelector('MedlineCitation > Article > ArticleDate');
  if (ad) {
    const parts = [ad.querySelector('Year'), ad.querySelector('Month'), ad.querySelector('Day')]
      .map(nodeText)
      .filter(Boolean);
    if (parts.length) return parts.join('-');
  }
  const pd = art.querySelector('MedlineCitation > Article > Journal > JournalIssue > PubDate');
  if (!pd) return null;
  const medline = nodeText(pd.querySelector('MedlineDate'));
  if (medline) return medline;
  const parts = [pd.querySelector('Year'), pd.querySelector('Month'), pd.querySelector('Day')]
    .map(nodeText)
    .filter(Boolean);
  return parts.length ? parts.join('-') : null;
}

// Build the `## Abstract` block, preserving structured-abstract section labels.
function abstractToMarkdown(art) {
  const nodes = Array.from(art.querySelectorAll('MedlineCitation > Article > Abstract > AbstractText'));
  const parts = [];
  for (const n of nodes) {
    const text = nodeText(n);
    if (!text) continue;
    const label = n.getAttribute('Label') || n.getAttribute('NlmCategory');
    parts.push(label ? `**${label}:** ${text}` : text);
  }
  return parts.length ? '## Abstract\n\n' + parts.join('\n\n') : null;
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
