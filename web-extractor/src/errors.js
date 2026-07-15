// Typed extraction errors. `code` is surfaced to the backend so it can map
// failures deterministically; `status` is the HTTP status the service returns.
export class ExtractionError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ExtractionError';
    this.code = code;
    this.status = status;
  }
}

export const invalidUrl = (msg = 'A valid http(s) url is required') =>
  new ExtractionError('invalid_url', 400, msg);

export const unsupportedContentType = (contentType) =>
  new ExtractionError('unsupported_content_type', 415, `Unsupported content type: ${contentType}`);

export const navigationFailed = (msg) =>
  new ExtractionError('navigation_failed', 502, `Navigation failed: ${msg}`);

export const timeout = (msg = 'Navigation or render exceeded the timeout') =>
  new ExtractionError('timeout', 504, msg);

export const emptyContent = (msg = 'No extractable content was found') =>
  new ExtractionError('empty_content', 422, msg);

export const payloadTooLarge = (msg = 'Payload exceeds the maximum allowed size') =>
  new ExtractionError('payload_too_large', 413, msg);

export const invalidInput = (msg = 'Invalid input') =>
  new ExtractionError('invalid_input', 400, msg);

export const botProtected = (msg = 'The page is protected by bot detection (e.g. reCAPTCHA)') =>
  new ExtractionError('bot_protected', 422, msg);

// Playwright surfaces timeouts as TimeoutError; normalize to our typed error.
export function isTimeoutError(err) {
  return err && (err.name === 'TimeoutError' || /Timeout .* exceeded/i.test(err.message ?? ''));
}
