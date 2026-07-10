import Fastify from 'fastify';
import { config } from './config.js';
import { browserManager } from './browser.js';
import { render } from './renderer.js';
import { extractFromHtml } from './extract.js';
import { ExtractionError, invalidUrl } from './errors.js';

export function validateUrl(body) {
  const url = body?.url;
  if (!url || typeof url !== 'string') throw invalidUrl();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalidUrl(`Malformed url: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw invalidUrl('Only http(s) urls are supported');
  }
  return parsed.href;
}

function sendError(app, reply, err) {
  if (err instanceof ExtractionError) {
    return reply.status(err.status).send({ error: err.code, message: err.message });
  }
  app.log.error(err);
  return reply.status(500).send({ error: 'internal_error', message: 'Unexpected extraction failure' });
}

// Build a Fastify instance with routes registered. Exported so tests can use
// `app.inject` without starting a browser or binding a port.
export function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true, bodyLimit: 1_048_576 });

  // Readiness including browser availability.
  app.get('/health', async (_req, reply) => {
    const ready = browserManager.ready();
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'up' : 'starting' });
  });

  // Main extraction contract.
  app.post('/extract', async (req, reply) => {
    try {
      const url = validateUrl(req.body);
      const { html, finalUrl } = await render(url);
      const { markdown, metadata } = extractFromHtml(html, finalUrl);
      return reply.send({ markdown, metadata });
    } catch (err) {
      return sendError(app, reply, err);
    }
  });

  // Debug endpoint: raw rendered HTML (+ optional screenshot). Not part of the
  // ingestion contract; intended for troubleshooting.
  app.post('/render', async (req, reply) => {
    try {
      const url = validateUrl(req.body);
      const wantShot = req.body?.screenshot === true;
      const { html, finalUrl, screenshot } = await render(url, { screenshot: wantShot });
      return reply.send({ finalUrl, html, screenshot });
    } catch (err) {
      return sendError(app, reply, err);
    }
  });

  return app;
}

async function main() {
  const app = buildApp();
  await browserManager.start();
  await app.listen({ port: config.port, host: config.host });

  const shutdown = async () => {
    try {
      await app.close();
      await browserManager.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Only bootstrap when run as the entrypoint, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
