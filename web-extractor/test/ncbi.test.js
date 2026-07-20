import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isPmcUrl, isPubmedUrl, fetchPubmedArticle, fetchPmcArticle } from '../src/ncbi-fetcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');

// Build a fetch stub that routes by URL substring, in declaration order.
function mockFetch(routes) {
  const fn = async (url) => {
    fn.calls.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    if (route.status && route.status >= 400) {
      return { ok: false, status: route.status, text: async () => '' };
    }
    return { ok: true, status: 200, text: async () => route.xml };
  };
  fn.calls = [];
  return fn;
}

// --- URL detection ---

test('isPubmedUrl matches pubmed article URLs with a numeric PMID', () => {
  assert.ok(isPubmedUrl('https://pubmed.ncbi.nlm.nih.gov/12750433/'));
  assert.ok(isPubmedUrl('https://www.pubmed.ncbi.nlm.nih.gov/12750433'));
});

test('isPubmedUrl rejects non-article pubmed URLs and other hosts', () => {
  assert.ok(!isPubmedUrl('https://pubmed.ncbi.nlm.nih.gov/?term=lupus'));
  assert.ok(!isPubmedUrl('https://example.com/12345'));
  assert.ok(!isPubmedUrl('not-a-url'));
});

test('isPmcUrl and isPubmedUrl do not overlap on their own domains', () => {
  const pmc = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10390700/';
  assert.ok(isPmcUrl(pmc));
  assert.ok(!isPubmedUrl(pmc));
});

// --- Abstract-only (closed / paywalled article) ---

test('fetchPubmedArticle returns abstract + metadata for a closed article', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-abstract-only.xml') },
  ]);
  const url = 'https://pubmed.ncbi.nlm.nih.gov/12750433/';
  const { markdown, metadata } = await fetchPubmedArticle(url, { _fetch });

  assert.match(markdown, /^## Abstract/);
  assert.match(markdown, /alpha-melanocyte stimulating hormone/);
  assert.equal(metadata.extractionConfidence, 'medium');
  assert.equal(metadata.canonicalUrl, 'https://doi.org/10.1124/jpet.103.051623');
  assert.equal(metadata.siteName, 'The Journal of pharmacology and experimental therapeutics');
  assert.equal(metadata.lang, 'en');
  assert.equal(metadata.published, '2003-05-15'); // prefers numeric ArticleDate
  assert.match(metadata.author, /Stephen J Getting/);
  assert.match(metadata.author, /Mauro Perretti/);
});

test('a PMCID that belongs to a reference does NOT trigger PMC escalation', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-abstract-only.xml') },
    { match: (u) => u.includes('db=pmc'), xml: fixture('pmc-fulltext.xml') },
  ]);
  await fetchPubmedArticle('https://pubmed.ncbi.nlm.nih.gov/12750433/', { _fetch });
  // Only the db=pubmed call happened; the reference's PMC9999999 is ignored.
  assert.equal(_fetch.calls.length, 1);
  assert.ok(_fetch.calls[0].includes('db=pubmed'));
});

// --- Open access → escalate to PMC full text ---

test('fetchPubmedArticle escalates to PMC full text for an open-access article', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-open-access.xml') },
    { match: (u) => u.includes('db=pmc'), xml: fixture('pmc-fulltext.xml') },
  ]);
  const url = 'https://pubmed.ncbi.nlm.nih.gov/37533870/';
  const { markdown, metadata } = await fetchPubmedArticle(url, { _fetch });

  assert.match(markdown, /full body content that is only available in PMC/);
  assert.equal(metadata.extractionConfidence, 'high');
  assert.equal(_fetch.calls.length, 2);
  assert.ok(_fetch.calls[1].includes('id=PMC10390700'));
});

// --- Fallback: PMC full text fails → keep the abstract ---

test('fetchPubmedArticle falls back to the abstract when PMC full text fails', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-open-access.xml') },
    { match: (u) => u.includes('db=pmc'), status: 500 },
  ]);
  const { markdown, metadata } = await fetchPubmedArticle(
    'https://pubmed.ncbi.nlm.nih.gov/37533870/',
    { _fetch },
  );
  assert.match(markdown, /## Abstract/);
  assert.equal(metadata.extractionConfidence, 'medium');
});

// --- Structured abstract labels ---

test('structured abstracts preserve their section labels in bold', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-open-access.xml') },
    { match: (u) => u.includes('db=pmc'), status: 404 },
  ]);
  const { markdown } = await fetchPubmedArticle(
    'https://pubmed.ncbi.nlm.nih.gov/37533870/',
    { _fetch },
  );
  assert.match(markdown, /\*\*BACKGROUND:\*\* Lupus is a complex autoimmune disease\./);
  assert.match(markdown, /\*\*RESULTS:\*\* Gut microbiota dysbiosis/);
});

test('collective (consortium) authors are preserved', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pubmed'), xml: fixture('pubmed-open-access.xml') },
    { match: (u) => u.includes('db=pmc'), status: 404 },
  ]);
  const { metadata } = await fetchPubmedArticle(
    'https://pubmed.ncbi.nlm.nih.gov/37533870/',
    { _fetch },
  );
  assert.match(metadata.author, /The Lupus Microbiome Consortium/);
});

// --- Direct PMC URL path still works after the refactor ---

test('fetchPmcArticle parses a direct PMC url via db=pmc', async () => {
  const _fetch = mockFetch([
    { match: (u) => u.includes('db=pmc'), xml: fixture('pmc-fulltext.xml') },
  ]);
  const url = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10390700/';
  const { markdown, metadata } = await fetchPmcArticle(url, { _fetch });

  assert.match(markdown, /## Abstract/);
  assert.match(markdown, /full body content that is only available in PMC/);
  assert.equal(metadata.extractionConfidence, 'high');
  assert.equal(metadata.canonicalUrl, 'https://doi.org/10.3389/fimmu.2023.1202850');
  assert.ok(_fetch.calls[0].includes('id=PMC10390700'));
});
