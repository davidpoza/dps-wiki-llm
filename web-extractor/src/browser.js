import { chromium } from 'playwright';
import { config } from './config.js';

// Owns a single long-lived Chromium instance and a bounded pool of browser
// contexts. The pool size is the concurrency cap; acquire() blocks (queues)
// when all contexts are in use. Auto-relaunches on crash.
class BrowserManager {
  constructor() {
    this.browser = null;
    this.launching = null;
    this.available = [];
    this.waiters = [];
    this.total = 0;
  }

  async start() {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;
    this.launching = chromium
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      })
      .then((browser) => {
        this.browser = browser;
        this.launching = null;
        browser.on('disconnected', () => this.#onDisconnected());
        return browser;
      });
    return this.launching;
  }

  ready() {
    return Boolean(this.browser && this.browser.isConnected());
  }

  #onDisconnected() {
    // Chromium died: drop all pooled contexts and let acquire() rebuild them.
    this.browser = null;
    this.available = [];
    this.total = 0;
  }

  async #createContext() {
    const browser = await this.start();
    return browser.newContext({
      userAgent: config.userAgent,
      locale: config.locale,
      viewport: config.viewport,
      ignoreHTTPSErrors: true,
    });
  }

  async acquire() {
    await this.start();
    if (this.available.length > 0) {
      return this.available.pop();
    }
    if (this.total < config.concurrency) {
      this.total += 1;
      try {
        return await this.#createContext();
      } catch (err) {
        this.total -= 1;
        throw err;
      }
    }
    // Pool exhausted: wait for a released context.
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async release(context) {
    // If the browser died while this context was checked out, discard it.
    if (!context || !this.ready()) {
      if (this.total > 0) this.total -= 1;
      return;
    }
    // Reset state by recreating a clean context is expensive; instead close
    // pages and reuse. Callers always close their own page, so just requeue.
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(context);
    } else {
      this.available.push(context);
    }
  }

  async discard(context) {
    if (this.total > 0) this.total -= 1;
    try {
      await context?.close();
    } catch {
      // ignore
    }
    // Wake a waiter with a fresh context if anyone is queued.
    const waiter = this.waiters.shift();
    if (waiter) {
      this.total += 1;
      this.#createContext().then(waiter).catch(() => {
        this.total -= 1;
      });
    }
  }

  async stop() {
    const browser = this.browser;
    this.browser = null;
    this.available = [];
    this.total = 0;
    await browser?.close().catch(() => {});
  }
}

export const browserManager = new BrowserManager();
