# web-content-extraction Specification

## Purpose
TBD - created by archiving change reliable-web-markdown-extractor. Update Purpose after archive.
## Requirements
### Requirement: Extraction service API
The system SHALL expose web content extraction as a standalone microservice with an HTTP API that accepts a URL and returns structured Markdown plus metadata, or a typed error.

#### Scenario: Successful extraction request
- **WHEN** a client sends `POST /extract` with a JSON body containing a valid http(s) `url`
- **THEN** the service responds with the extracted Markdown body and a metadata object (final URL, canonical URL, title, author, published date, site name, language, extraction confidence)

#### Scenario: Invalid URL rejected
- **WHEN** a client requests extraction for a URL whose scheme is not `http` or `https`, or the body is missing a URL
- **THEN** the service responds with a typed validation error and does not attempt navigation

#### Scenario: Health check
- **WHEN** a client requests the service health endpoint
- **THEN** the service reports whether it is ready to serve extractions (including browser availability)

#### Scenario: Debug render endpoint
- **WHEN** a developer requests the `/render` debug endpoint for a URL
- **THEN** the service returns the raw rendered HTML (and optionally a screenshot) to aid troubleshooting, independent of the extraction/ingestion path

### Requirement: Always-browser rendering
The system SHALL load every requested URL in a real browser with a realistic client fingerprint, so that JavaScript-rendered pages are extractable and sites that reject non-browser clients are handled.

#### Scenario: JavaScript-rendered page is extracted
- **WHEN** a page renders its main content client-side via JavaScript
- **THEN** the service navigates in the browser, waits for the content to render, and extracts from the rendered DOM

#### Scenario: Realistic client fingerprint
- **WHEN** the service navigates to a page
- **THEN** it presents a realistic desktop user-agent, headers, viewport, and locale rather than a bare HTTP-client signature

#### Scenario: Navigation is bounded
- **WHEN** navigation or rendering exceeds the configured per-request timeout
- **THEN** the request is aborted and the service returns a typed `timeout` error rather than blocking indefinitely

#### Scenario: Non-HTML final response rejected
- **WHEN** the navigated resource resolves to non-HTML content (e.g. `application/pdf`, an image)
- **THEN** the service does not attempt HTML extraction and returns a typed `unsupported_content_type` error

### Requirement: Main-content isolation
The system SHALL isolate the primary article content of a page and remove site chrome and boilerplate before conversion.

#### Scenario: Boilerplate is stripped
- **WHEN** a page contains navigation, header, footer, sidebar/aside, cookie/consent banners, or share/related-article widgets
- **THEN** those elements are excluded from the extracted markdown, leaving the main article body

#### Scenario: Article body is retained
- **WHEN** a typical article page is extracted
- **THEN** the main body text and its structure are retained in full without truncating meaningful content

### Requirement: Structured HTML-to-Markdown conversion
The system SHALL convert the isolated content into well-formed Markdown that preserves the document's structure and inline formatting.

#### Scenario: Block structure preserved
- **WHEN** the source content contains headings, paragraphs, ordered and unordered lists, tables, blockquotes, and code blocks
- **THEN** each is rendered with the corresponding Markdown construct (`#` headings, `-`/`1.` lists, pipe tables, `>` quotes, fenced code blocks)

#### Scenario: Inline formatting preserved
- **WHEN** the source content contains bold, italic, inline code, links, and images
- **THEN** each is rendered with the corresponding Markdown syntax

#### Scenario: Relative URLs made absolute
- **WHEN** the source content contains links or images with relative URLs
- **THEN** they are resolved against the page's final URL and emitted as absolute URLs

### Requirement: Metadata capture and consumption
The system SHALL capture available page metadata and the ingesting backend SHALL persist it in a machine-parseable header consumed deterministically by normalization.

#### Scenario: Core metadata captured
- **WHEN** a page exposes a title, canonical URL, author/byline, published date, site name, or language (via `<title>`, `<meta>`, Open Graph, or JSON-LD)
- **THEN** the available fields are returned in the extraction metadata, and the final resolved URL is always included

#### Scenario: Frontmatter written and normalized
- **WHEN** the backend writes an extracted web source to `raw/web/**`
- **THEN** it records the metadata as YAML frontmatter, and `SourceNormalizer` reads the source/canonical URL from that frontmatter without relying on brittle plain-text line parsing

### Requirement: Fallback and quality signaling
The system SHALL degrade gracefully when reliable extraction is not possible and SHALL signal low-confidence results rather than silently emitting empty or misleading content.

#### Scenario: Fallback when main-content detection is weak
- **WHEN** main-content isolation of the rendered page yields little or no usable content
- **THEN** the service falls back to converting a sanitized whole-document body and marks the extraction confidence as low

#### Scenario: Extraction failure is explicit
- **WHEN** a page cannot be navigated or produces no extractable content after fallback
- **THEN** the service returns a typed error and the backend does not write an empty or malformed raw file

#### Scenario: Extractor unavailable surfaces a clear error
- **WHEN** the backend cannot reach the extraction microservice while ingesting a URL
- **THEN** the backend surfaces a clear ingest error to the caller rather than writing partial content, and other ingestion paths (markdown upload) remain unaffected

