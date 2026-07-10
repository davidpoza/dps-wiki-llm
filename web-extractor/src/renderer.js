import { browserManager } from './browser.js';
import { config } from './config.js';
import { navigationFailed, timeout, unsupportedContentType, isTimeoutError } from './errors.js';

// Load a URL in a real browser and return the rendered HTML + final URL.
// Hybrid wait: `domcontentloaded` first, then best-effort `networkidle`
// bounded by a short budget so polling/keep-alive pages don't hang.
// All resources are loaded (no request blocking) for maximum fidelity.
export async function render(url, { screenshot = false } = {}) {
  const context = await browserManager.acquire();
  let page;
  let discarded = false;
  try {
    page = await context.newPage();

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.navTimeoutMs,
      });
    } catch (err) {
      if (isTimeoutError(err)) throw timeout();
      throw navigationFailed(err.message);
    }

    if (response) {
      const contentType = (response.headers()['content-type'] ?? '').toLowerCase();
      if (contentType && !contentType.includes('html')) {
        throw unsupportedContentType(contentType.split(';')[0].trim());
      }
    }

    // Best-effort settle; ignore timeout and extract whatever rendered.
    await page
      .waitForLoadState('networkidle', { timeout: config.networkIdleMs })
      .catch(() => {});

    const finalUrl = page.url();
    const html = await page.content();
    const shot = screenshot ? (await page.screenshot({ fullPage: true })).toString('base64') : undefined;
    return { html, finalUrl, screenshot: shot };
  } catch (err) {
    // A crashed page/context should not be reused.
    if (err && /Target closed|crash|Session closed/i.test(err.message ?? '')) {
      discarded = true;
      await browserManager.discard(context);
    }
    throw err;
  } finally {
    try {
      await page?.close();
    } catch {
      /* ignore */
    }
    if (!discarded) await browserManager.release(context);
  }
}
