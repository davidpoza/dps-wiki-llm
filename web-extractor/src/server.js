import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { browserManager } from './browser.js';
import { render } from './renderer.js';
import { extractFromHtml, extractFromPdf } from './extract.js';
import { fetchPdf, isPdfUrl } from './pdf-fetcher.js';
import { isYoutubeUrl, fetchYoutubeTranscript, srtToMarkdown } from './youtube-fetcher.js';
import { isPmcUrl, fetchPmcArticle } from './ncbi-fetcher.js';
import { ExtractionError, invalidUrl, invalidInput, payloadTooLarge, emptyContent } from './errors.js';

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

  app.register(multipart, { limits: { fileSize: config.pdfMaxBytes } });

  // Readiness including browser availability.
  app.get('/health', async (_req, reply) => {
    const ready = browserManager.ready();
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'up' : 'starting' });
  });

  // Main extraction contract. Automatically handles YouTube URLs, PDF URLs, and HTML pages.
  app.post('/extract', async (req, reply) => {
    try {
      const url = validateUrl(req.body);

      if (isYoutubeUrl(url)) {
        const { srtContent, title, videoUrl } = await fetchYoutubeTranscript(url);
        const markdown = srtToMarkdown(srtContent, title);
        const metadata = { source: videoUrl, title, extractionConfidence: 'high' };
        return reply.send({ markdown, metadata });
      }

      if (isPmcUrl(url)) {
        const { markdown, metadata } = await fetchPmcArticle(url);
        return reply.send({ markdown, metadata });
      }

      if (await isPdfUrl(url)) {
        const buffer = await fetchPdf(url);
        const { markdown, metadata } = await extractFromPdf(buffer, { source: url });
        return reply.send({ markdown, metadata });
      }

      const { html, finalUrl } = await render(url);
      const { markdown, metadata } = extractFromHtml(html, finalUrl);
      return reply.send({ markdown, metadata });
    } catch (err) {
      return sendError(app, reply, err);
    }
  });

  // File upload endpoint — accepts PDF or Markdown (.md).
  app.post('/extract/file', async (req, reply) => {
    try {
      let data;
      try {
        data = await req.file();
      } catch {
        throw invalidInput('Request must be multipart/form-data with a "file" field');
      }

      if (!data) throw invalidInput('Missing "file" field in multipart body');

      const mime = (data.mimetype ?? '').toLowerCase();
      const filename = data.filename ?? '';
      const isPdf = mime.includes('application/pdf');
      const isMd =
        mime.includes('text/markdown') ||
        mime.includes('text/x-markdown') ||
        ((mime.includes('text/plain') || mime === '') && filename.endsWith('.md'));

      if (!isPdf && !isMd) {
        throw invalidInput(`Unsupported file type: ${mime || 'unknown'}. Send application/pdf or a .md file`);
      }

      // Consume stream. @fastify/multipart truncates when fileSize limit is
      // exceeded and sets file.truncated = true; check after drain.
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      if (data.file.truncated) {
        throw payloadTooLarge(`File exceeds the ${config.pdfMaxBytes} byte limit`);
      }
      const buffer = Buffer.concat(chunks);

      if (isPdf) {
        const { markdown, metadata } = await extractFromPdf(buffer, {
          source: 'upload',
          filename,
        });
        return reply.send({ markdown, metadata });
      }

      // Markdown: return content as-is.
      const markdown = buffer.toString('utf8');
      if (!markdown.trim()) throw emptyContent();
      return reply.send({
        markdown,
        metadata: { source: 'upload', filename, extractionConfidence: 'high' },
      });
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
