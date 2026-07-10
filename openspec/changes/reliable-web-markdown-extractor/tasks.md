## 1. Microservice scaffold

- [x] 1.1 Create `web-extractor/` Node project (package.json, TS/JS config, lint) with pinned deps: `playwright`, `@mozilla/readability`, `jsdom`, `turndown`, `turndown-plugin-gfm`, and an HTTP framework (Express/Fastify)
- [x] 1.2 Add a Dockerfile with embedded Chromium (Playwright base image or `npx playwright install --with-deps chromium`)
- [x] 1.3 Implement `GET /health` reporting readiness including browser availability
- [x] 1.4 Implement `POST /extract` request/response contract (`{url}` → `{markdown, metadata}` or typed error) with input validation (http(s) only)
- [x] 1.5 Implement a `/render` debug endpoint returning the raw rendered HTML (+ optional screenshot) for a URL

## 2. Browser rendering

- [x] 2.1 Implement a browser lifecycle: launch Chromium once, manage a bounded pool of contexts, auto-relaunch on crash
- [x] 2.2 Navigate with a realistic desktop user-agent, headers, viewport, and locale
- [x] 2.3 Apply a bounded per-request navigation/render timeout with a hybrid wait (`domcontentloaded` then `networkidle` bounded by the timeout); load all resources (no resource blocking); return typed `timeout` on overrun
- [x] 2.4 Detect non-HTML final responses and return typed `unsupported_content_type`; return typed `navigation_failed` on load errors

## 3. Extraction pipeline

- [x] 3.1 Run `@mozilla/readability` (via jsdom) on the rendered DOM to isolate main content and strip nav/header/footer/aside/cookie/consent/share/related
- [x] 3.2 Convert isolated HTML to Markdown with Turndown + GFM plugin (headings, lists, tables, blockquotes, code, emphasis, links, images)
- [x] 3.3 Resolve relative links/images to absolute URLs against the final resolved URL
- [x] 3.4 Extract metadata (title, canonical, author, published, site name, language) from `<title>`/`<meta>`/Open Graph/JSON-LD; always include the final URL
- [x] 3.5 Implement fallback: when isolated content is below a minimum-content threshold, convert sanitized full `<body>` and set `extraction_confidence: low`; return typed `empty_content` if still empty

## 4. Backend integration

- [x] 4.1 Add a thin `WebExtractorClient` in the backend that calls `POST /extract` (WebClient/RestClient) with the configured timeout, mapping typed service errors to `WebExtractionException`
- [x] 4.2 Rewire `RawIntakeService.ingestUrl` to call the client and write YAML frontmatter + structured markdown to `raw/web/**`; remove the old Jsoup `.text()` logic
- [x] 4.3 Update `SourceNormalizer.canonicalUrl` (and title inference if needed) to parse the frontmatter, keeping a legacy `Source URL:` fallback
- [x] 4.4 Populate `NormalizedSourcePayload` metadata from the frontmatter fields
- [x] 4.5 Add extractor service URL + timeout to `AppProperties`; surface a clear ingest error when the service is unreachable

## 5. Infra

- [x] 5.1 Add the `web-extractor` service to `docker-compose.yml` (build context, internal network, resource limits, healthcheck)
- [x] 5.2 Wire the extractor URL into backend config via `.env.sample` and compose env
- [x] 5.3 Update `README.md`/`AGENTS.md` with the new service, its API, and the raw/web frontmatter format

## 6. Tests

- [x] 6.1 Microservice: extraction tests over static HTML fixtures (article with headings/lists/tables/code, boilerplate-heavy page, relative-URL page, non-UTF-8 page, JS-rendered page) asserting structure, absolutized URLs, metadata, and low-confidence fallback
- [x] 6.2 Microservice: error-path tests (invalid URL, non-HTML, timeout, empty content)
- [x] 6.3 Backend: `WebExtractorClient` + `RawIntakeService.ingestUrl` tests with a mocked extractor (success, typed error, service unreachable)
- [x] 6.4 Backend: `SourceNormalizer` frontmatter parsing plus legacy `Source URL:` fallback
- [x] 6.5 Update existing ingestion/E2E tests that assert the old `# title / Source URL:` raw format

## 7. Verification

- [x] 7.1 Run backend tests (`mvn -pl backend test`) and microservice tests; confirm green
- [ ] 7.2 `docker compose up` and ingest representative real URLs (including a JS-heavy SPA and a site that blocks non-browser clients); inspect produced `raw/web/**` markdown for fidelity
