/**
 * Manages a single Puppeteer browser session.
 * The MCP server maintains one active browser + page at a time.
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import type { BrowserAdapter, RuntimeArtifacts } from "@sudobility/testomniac_runner_service";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 800;

let browser: Browser | null = null;
let page: Page | null = null;
let adapter: BrowserAdapter | null = null;

export async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.connected) {
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    };
    // Allow override if developer has a preferred Chromium install
    if (process.env["CHROMIUM_PATH"]) {
      launchOptions.executablePath = process.env["CHROMIUM_PATH"];
    }
    browser = await puppeteer.launch(launchOptions);
    page = null;
  }

  if (!page || page.isClosed()) {
    page = await browser.newPage();
    adapter = null; // reset so it's recreated for the new page
    await page.setViewport({
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
    });
  }

  return page;
}

export async function getPage(): Promise<Page> {
  if (!page || page.isClosed()) {
    return ensureBrowser();
  }
  return page;
}

export async function closeBrowser(): Promise<void> {
  adapter = null;
  if (page && !page.isClosed()) {
    await page.close().catch(() => {});
    page = null;
  }
  if (browser && browser.connected) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export function isBrowserActive(): boolean {
  return !!browser && browser.connected && !!page && !page.isClosed();
}

/**
 * Returns the persistent BrowserAdapter for the current page.
 * Lazily creates one if needed. Logs accumulate across the session.
 */
export async function getAdapter(): Promise<BrowserAdapter> {
  const p = await getPage();
  if (!adapter) {
    adapter = createAdapter(p);
  }
  return adapter;
}

/**
 * Creates a BrowserAdapter from a Puppeteer page.
 * Prefer getAdapter() for shared state (logs). This is exposed for
 * cases that need a fresh adapter (e.g. scan with its own lifecycle).
 */
export function createAdapter(puppeteerPage: Page): BrowserAdapter {
  const consoleLogs: string[] = [];
  const networkLogs: Array<{
    method: string;
    url: string;
    status: number;
    contentType: string;
    timestampMs?: number;
  }> = [];

  puppeteerPage.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  puppeteerPage.on("response", (res) => {
    networkLogs.push({
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      contentType: res.headers()["content-type"] || "",
      timestampMs: Date.now(),
    });
  });

  return {
    async goto(url: string, options?: { waitUntil?: string; timeout?: number }) {
      await puppeteerPage.goto(url, {
        waitUntil: (options?.waitUntil as "load" | "networkidle0") || "load",
        timeout: options?.timeout ?? 30000,
      });
    },
    async click(selector: string, options?: { timeout?: number }) {
      await puppeteerPage.waitForSelector(selector, { timeout: options?.timeout ?? 5000 });
      await puppeteerPage.click(selector);
    },
    async hover(selector: string, options?: { timeout?: number }) {
      await puppeteerPage.waitForSelector(selector, { timeout: options?.timeout ?? 5000 });
      await puppeteerPage.hover(selector);
    },
    async type(selector: string, text: string) {
      await puppeteerPage.click(selector, { count: 3 });
      await puppeteerPage.type(selector, text);
    },
    async waitForSelector(selector: string, options?: { visible?: boolean; timeout?: number }) {
      try {
        await puppeteerPage.waitForSelector(selector, {
          visible: options?.visible,
          timeout: options?.timeout ?? 5000,
        });
        return true;
      } catch {
        return false;
      }
    },
    async waitForNavigation(options?: { waitUntil?: string; timeout?: number }) {
      await puppeteerPage.waitForNavigation({
        waitUntil: (options?.waitUntil as "load") || "load",
        timeout: options?.timeout ?? 30000,
      });
    },
    async evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
      if (typeof fn === "string") {
        return puppeteerPage.evaluate(fn) as Promise<T>;
      }
      return puppeteerPage.evaluate(fn, ...args);
    },
    async content() {
      return puppeteerPage.content();
    },
    url() {
      return puppeteerPage.url();
    },
    async getUrl() {
      return puppeteerPage.url();
    },
    async screenshot(options?: { type?: string; quality?: number }) {
      const buffer = await puppeteerPage.screenshot({
        type: (options?.type as "jpeg" | "png") || "jpeg",
        quality: options?.quality ?? 80,
      });
      return new Uint8Array(buffer);
    },
    async setViewport(width: number, height: number) {
      await puppeteerPage.setViewport({ width, height });
    },
    async pressKey(key: string) {
      await puppeteerPage.keyboard.press(key as any);
    },
    async select(selector: string, value: string) {
      await puppeteerPage.select(selector, value);
    },
    async submitTextEntry(selector: string) {
      await puppeteerPage.focus(selector);
      await puppeteerPage.keyboard.press("Enter");
    },
    async close() {
      // Don't actually close — managed by browser-session
    },
    on(event: "console" | "response", handler: (...args: unknown[]) => void) {
      puppeteerPage.on(event, handler as any);
      return () => puppeteerPage.off(event, handler as any);
    },
    async closeOtherTabs() {
      const pages = await puppeteerPage.browser().pages();
      for (const p of pages) {
        if (p !== puppeteerPage && !p.isClosed()) {
          await p.close().catch(() => {});
        }
      }
    },
    getRuntimeArtifacts(): RuntimeArtifacts {
      return { consoleLogs: [...consoleLogs], networkLogs: [...networkLogs] };
    },
    resetRuntimeArtifacts() {
      consoleLogs.length = 0;
      networkLogs.length = 0;
    },
  };
}
