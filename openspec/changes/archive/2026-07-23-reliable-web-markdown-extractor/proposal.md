## Why

The current web ingestion path (`RawIntakeService.ingestUrl`) fetches a page with Jsoup and flattens the whole `<body>` to plain text (`Jsoup.parse(cleanHtml).text()`). This destroys all structure (headings, lists, tables, code blocks, links) and keeps boilerplate (navigation, cookie banners, footers, related-article widgets). It also uses a plain HTTP client, so JS-rendered pages come back empty and a growing number of sites block non-browser clients outright. The result is low-fidelity or missing content that degrades downstream LLM enrichment and semantic retrieval. We want web→markdown extraction to be as reliable as possible: always load pages like a real browser, and isolate clean, structured article content.

## What Changes

- Introduce a standalone **`web-extractor` microservice** (Node + Playwright, Chromium embedded) exposing an HTTP API (`POST /extract {url}` → `{markdown, metadata}`), decoupled from the Spring backend.
- **Always render every URL in a real browser** (realistic user-agent/headers/viewport) to handle JS-rendered pages and avoid blocks from sites that detect non-browser clients. No plain-HTTP fast path.
- Isolate primary article content (Readability), stripping chrome/boilerplate (nav, header, footer, aside, ads, cookie/consent banners, share/related widgets).
- Convert isolated HTML to structured Markdown (Turndown + GFM) preserving headings, paragraphs, lists, tables, blockquotes, inline/block code, emphasis, images, and links with absolute URLs.
- Extract metadata (final URL, canonical URL, title, author, published date, site name, language) and return it alongside the markdown.
- Rewire the Spring backend to call the microservice over HTTP and write structured markdown + YAML frontmatter to `raw/web/**`; `SourceNormalizer` consumes the frontmatter.
- Robustness: bounded per-request timeout, concurrency cap / browser-context pool, typed errors, and a low-confidence whole-body fallback (never empty output).
- **BREAKING**: The on-disk format of `raw/web/**` changes (YAML frontmatter + structured markdown instead of `# title / Source URL: / flat text`); `SourceNormalizer` canonical-URL parsing is updated (legacy fallback retained). URL ingestion now depends on the `web-extractor` service being available.

## Capabilities

### New Capabilities
- `web-content-extraction`: A browser-based microservice that fetches a URL, isolates the main content, and returns reliable structured Markdown plus metadata — covering always-browser rendering, main-content isolation, HTML→Markdown fidelity, request robustness, and fallback/quality handling.

### Modified Capabilities
<!-- No existing spec governs web ingestion requirements today; behavior is introduced as a new capability. -->

## Impact

- **New service**: `web-extractor/` — Node + Playwright + @mozilla/readability + Turndown, embedded Chromium, Dockerfile, `POST /extract` + `GET /health`.
- **Infra**: `docker-compose.yml` — add the `web-extractor` service (with resource limits); `.env.sample` / backend config gains its URL and timeout.
- **Backend code**: `services/RawIntakeService.java` (delegates URL ingestion via a thin `WebExtractorClient` HTTP call), `services/SourceNormalizer.java` (frontmatter/canonical parsing), `domain/NormalizedSourcePayload` metadata population, `config/AppProperties.java`. No new JVM extraction libs needed.
- **Storage**: `vault/raw/web/**` format changes (see BREAKING above); existing files remain valid markdown.
- **Tests**: microservice extraction tests over HTML fixtures; backend client tests (mocked service); normalizer tests; existing ingestion/E2E assertions on the old header updated.
- **APIs**: the ingest URL endpoint contract is unchanged; produced raw content improves.
