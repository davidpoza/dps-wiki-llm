// Runtime configuration sourced from environment variables.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  // Bounded number of concurrent browser contexts (concurrency cap).
  concurrency: Number(process.env.EXTRACTOR_CONCURRENCY ?? 3),
  // Global per-request navigation + render budget.
  navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS ?? 30000),
  // How long we additionally wait for `networkidle` before giving up and
  // extracting whatever rendered (hybrid wait strategy).
  networkIdleMs: Number(process.env.NETWORKIDLE_MS ?? 4000),
  // Minimum article text length below which extraction is treated as low confidence.
  minContentChars: Number(process.env.MIN_CONTENT_CHARS ?? 200),
  userAgent:
    process.env.USER_AGENT ??
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  locale: process.env.LOCALE ?? 'en-US',
  viewport: { width: 1280, height: 900 },
};
