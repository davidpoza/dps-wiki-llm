## Context

Web URL ingestion currently lives in `RawIntakeService.ingestUrl(String url)`. It uses Jsoup to fetch the page, cleans the body with `Safelist.basic()`, then calls `.text()` — collapsing the whole document into a plain-text blob prefixed with `# <title>` and a `Source URL:` line. `SourceNormalizer` re-parses that `Source URL:` line and infers `SourceKind.web` from the `raw/web/` path.

Problems: all structure is lost (headings, lists, tables, code, links, images); boilerplate (nav, footer, cookie banners, related widgets) is retained; no metadata beyond title; canonical-URL recovery is fragile; and a plain HTTP client is increasingly blocked by sites that reject non-browser clients (anti-bot walls, JS-only rendering).

Two shaping requirements drive this design:
- **Always render in a real browser.** Every URL is loaded in a real Chromium instance (realistic user-agent/headers/viewport) so JS-rendered pages work and sites that detect non-browser clients don't block us. There is no plain-HTTP fast path.
- **Ship extraction as its own microservice.** The browser + extraction stack is isolated in a standalone service with an HTTP API, decoupled from the Spring backend's lifecycle, memory, and deploy cadence.

## Goals / Non-Goals

**Goals:**
- A standalone `web-extractor` microservice (Node + Playwright, Chromium embedded) exposing `POST /extract` → structured Markdown + metadata.
- Always load pages in a real browser to maximize success against JS-rendered and anti-bot-guarded sites.
- Isolate main content (Readability), convert to faithful Markdown (Turndown + GFM), absolutize URLs, and extract metadata.
- Spring backend consumes the microservice over HTTP and writes structured markdown + frontmatter to `raw/web/**`.
- Bounded per-request timeout, concurrency cap, typed errors, and graceful low-confidence fallback (never empty output).

**Non-Goals:**
- Defeating captchas, login walls, or aggressive bot-mitigation (Cloudflare challenges, etc.) — best-effort realistic browser only.
- Crawling / pagination / multi-page stitching.
- PDF or non-HTML document extraction.
- Changing the ingest REST endpoint contract or the async job pipeline in the backend.
- SSRF hardening (blocking private/loopback IP ranges) — deferred to a follow-up change.

## Architecture

```
Angular ─▶ Spring backend ──HTTP──▶ web-extractor microservice ──▶ Chromium (embedded, Playwright)
  (ingest URL)   │  POST /extract {url}         │ navigate → Readability → Turndown → metadata
                 │◀── {markdown, metadata} ─────┘
                 ▼
        write frontmatter + markdown to raw/web/**  ──▶ SourceNormalizer ──▶ enrich/embeddings
```

New docker-compose service `web-extractor` sits alongside `backend`, `postgres`, `embeddings`, etc. The backend reaches it by service name over the internal network.

## Decisions

**1. Standalone microservice, not in-process extraction.**
The browser stack (Chromium, Playwright, page memory, crash surface) lives in its own container with an HTTP API (`POST /extract`, `GET /health`). Rationale: isolates the browser's resource/crash blast radius, lets it scale and deploy independently, and keeps the JVM backend image light. The backend becomes a thin HTTP client. Alternative considered: embedding Playwright-Java in the backend — rejected (couples browser lifecycle to the API, heavy JVM image, weaker JS-ecosystem extraction libs).

**2. Node + Playwright stack for the microservice.**
Implement in Node.js with **Playwright** (browser automation), **@mozilla/readability** (main-content isolation), and **Turndown + turndown-plugin-gfm** (HTML→Markdown, incl. tables). Rationale: this is the most mature ecosystem for browser-driven extraction; Readability and Turndown are the de-facto references. Note: the legacy Node/n8n stack was removed earlier — this is a small, single-purpose service, not a revival of that stack. Alternatives considered: Python (Playwright + trafilatura + markdownify) — strong, but a third language; Java (readability4j + flexmark) — weaker extraction libs and still needs browser binaries.

**3. Chromium embedded in the microservice container.**
Playwright's Chromium is installed inside the microservice image (`mcr.microsoft.com/playwright` base or `npx playwright install --with-deps chromium`). Rationale: one self-contained service to deploy; no separate browser sidecar to wire. Trade-off vs a `browserless` sidecar: the service image is larger and browser crashes affect the same container — mitigated by a browser-context pool and auto-relaunch.

**4. Always-browser navigation with realistic fingerprint.**
Every request launches/reuses a browser context with a realistic desktop user-agent, headers, viewport, and locale, navigates with a bounded timeout, and produces typed errors on non-HTML final responses and navigation failures. **Wait strategy = hybrid**: wait for `domcontentloaded`, then attempt `networkidle` bounded by the global per-request timeout (so polling/keep-alive pages don't hang the request). Rationale: balances SPA fidelity against robustness. **Resource loading = load everything** (images, fonts, media, third-party scripts): maximizes fidelity and avoids breaking sites that gate rendering on those resources; the extra latency/memory is acceptable given async downstream ingestion. `<img>`/asset URLs are read from the DOM for the markdown regardless.

**5. Extraction pipeline inside the service.**
Rendered DOM HTML → Readability (isolate article, strip nav/header/footer/aside/cookie/consent/share/related) → Turndown+GFM to Markdown → resolve relative links/images to absolute against the final URL → collect metadata (title, canonical, author, published, site name, language) from `<title>`/`<meta>`/Open Graph/JSON-LD. Returns `{ markdown, metadata }`.

**6. Backend contract & storage.**
`RawIntakeService.ingestUrl` calls `POST /extract`, receives `{markdown, metadata}`, and writes a `raw/web/**` file with **YAML frontmatter** (`source_url`, `canonical_url`, `title`, `author`, `published`, `site`, `lang`, `extraction_confidence`) followed by the markdown body. `SourceNormalizer` parses the frontmatter for the canonical URL (legacy `Source URL:` line kept as fallback). Extractor URL and timeout are configurable via `AppProperties`.

**7. Debug endpoint.**
Expose an auxiliary `GET/POST /render` endpoint that returns the raw rendered HTML (and optionally a screenshot) for a URL, to diagnose why an extraction produced unexpected markdown. Intended for development/troubleshooting; not part of the ingestion contract.

**8. Resilience & limits.**
Per-request navigation + extraction timeout; a concurrency cap / context pool in the microservice to bound memory; typed error responses (`unsupported_content_type`, `navigation_failed`, `timeout`, `empty_content`). If Readability yields too little, fall back to converting the sanitized full `<body>` with `extraction_confidence: low`; if even that is empty, return an error. If the microservice is unreachable, the backend surfaces a clear ingest error (URL ingestion depends on it being up).

## Risks / Trade-offs

- **New language/runtime (Node) reintroduced after removing the legacy stack** → Scope is one small single-purpose service with a narrow API and pinned deps; document ownership and keep it dependency-light.
- **Browser is heavy (RAM/CPU) and can crash** → Embedded Chromium with a bounded context pool, per-request timeouts, and auto-relaunch on crash; container resource limits in compose.
- **Always-browser is slower than a static fetch** → Acceptable: URL ingestion is already async/queued downstream; reliability and anti-bot resilience are the priority over latency.
- **Hard dependency: no extractor ⇒ no URL ingestion** → Health check + clear typed backend error; markdown-file ingestion path is unaffected.
- **Anti-bot arms race (Cloudflare, captchas)** → Explicit non-goal; realistic fingerprint is best-effort, not guaranteed.
- **SSRF (fetching internal hosts via the browser)** → Deferred to a follow-up; only http(s) allowed for now, relying on network boundaries.
- **BREAKING raw/web format change** → Old files stay valid markdown; `SourceNormalizer` accepts both frontmatter and legacy `Source URL:`; update tests asserting the old format.

## Migration Plan

1. Scaffold the `web-extractor` Node service (Playwright + Readability + Turndown), `POST /extract`, `GET /health`, Dockerfile with embedded Chromium.
2. Add the `web-extractor` service to `docker-compose.yml`; expose its URL to the backend via env/`AppProperties`.
3. Replace backend `WebContentExtractor` internals with a thin HTTP `WebExtractorClient`; rewire `RawIntakeService.ingestUrl`; remove the abandoned plan to add readability4j/flexmark to the JVM.
4. Update `SourceNormalizer` to parse frontmatter (legacy fallback). Populate `NormalizedSourcePayload` metadata.
5. Tests: microservice extraction tests over HTML fixtures; backend client tests (mocked service); normalizer tests; update E2E assertions.
6. Deploy the new service + backend together. Rollback = revert; previously ingested files remain valid markdown.

## Decisions (resolved)

- **Readability library / stack**: Node + Playwright + @mozilla/readability + Turndown.
- **Deployment**: standalone microservice with embedded Chromium.
- **Rendering**: always real browser, no static path.
- **Wait strategy**: hybrid — `domcontentloaded` then `networkidle` bounded by the global timeout.
- **Resource loading**: load everything (no resource blocking).
- **Debug endpoint**: `/render` returning raw rendered HTML (+ optional screenshot).
- **SSRF hardening**: deferred to a follow-up change.

## Open Questions

- None blocking. Concrete `networkidle` bound (e.g. 3-5s within the global timeout) and default per-request timeout to be tuned during implementation.
