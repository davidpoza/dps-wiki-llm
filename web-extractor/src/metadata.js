// Metadata extraction from a jsdom Document. Reads <title>, <meta> (name/
// property), Open Graph, and JSON-LD. Returns best-effort fields; the final
// URL is always supplied by the caller.
export function extractMetadata(doc, finalUrl) {
  const meta = (selector, attr = 'content') => {
    const el = doc.querySelector(selector);
    const val = el?.getAttribute(attr);
    return val && val.trim() ? val.trim() : null;
  };

  const jsonLd = readJsonLd(doc);

  const canonical =
    meta('link[rel="canonical"]', 'href') ||
    meta('meta[property="og:url"]') ||
    finalUrl;

  const title =
    meta('meta[property="og:title"]') ||
    (doc.title && doc.title.trim() ? doc.title.trim() : null) ||
    jsonLd.title ||
    null;

  const author =
    meta('meta[name="author"]') ||
    meta('meta[property="article:author"]') ||
    jsonLd.author ||
    null;

  const published =
    meta('meta[property="article:published_time"]') ||
    meta('meta[name="date"]') ||
    meta('meta[itemprop="datePublished"]') ||
    jsonLd.published ||
    null;

  const siteName =
    meta('meta[property="og:site_name"]') ||
    jsonLd.siteName ||
    null;

  const lang =
    doc.documentElement?.getAttribute('lang') ||
    meta('meta[http-equiv="content-language"]') ||
    null;

  return {
    finalUrl,
    canonicalUrl: canonical,
    title,
    author,
    published,
    siteName,
    lang: lang ? lang.trim() : null,
  };
}

function readJsonLd(doc) {
  const out = {};
  const nodes = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const node of nodes) {
    let data;
    try {
      data = JSON.parse(node.textContent);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      const graph = item?.['@graph'] ? item['@graph'] : [item];
      for (const entry of graph) {
        if (!entry || typeof entry !== 'object') continue;
        out.title ??= entry.headline || entry.name || null;
        out.published ??= entry.datePublished || null;
        out.siteName ??= entry.publisher?.name || null;
        const author = entry.author;
        out.author ??= Array.isArray(author)
          ? author.map((a) => a?.name).filter(Boolean).join(', ') || null
          : author?.name || (typeof author === 'string' ? author : null);
      }
    }
  }
  return out;
}
