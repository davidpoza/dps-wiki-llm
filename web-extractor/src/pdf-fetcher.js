import { config } from './config.js';
import { navigationFailed, payloadTooLarge } from './errors.js';

/**
 * Download a PDF from `url` using the Node.js global fetch.
 * Returns the raw buffer; throws if the response indicates an error,
 * the content-type is not PDF, or the body exceeds `config.pdfMaxBytes`.
 *
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
export async function fetchPdf(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw navigationFailed(err.message);
  }

  if (!response.ok) {
    throw navigationFailed(`HTTP ${response.status} fetching PDF`);
  }

  // Stream body with size guard to avoid buffering huge files.
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > config.pdfMaxBytes) {
      throw payloadTooLarge(`PDF exceeds the ${config.pdfMaxBytes} byte limit`);
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Issue a HEAD request to `url` and return true if the server declares
 * `Content-Type: application/pdf`.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isPdfUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const ct = res.headers.get('content-type') ?? '';
    return ct.toLowerCase().includes('application/pdf');
  } catch {
    return false;
  }
}
