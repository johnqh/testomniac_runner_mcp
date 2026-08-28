/**
 * Chromium path for the spawned runner.
 *
 * The MCP drives its own browser through `puppeteer`, which downloads a
 * Chrome for Testing build. The runner it spawns uses `puppeteer-core`, which
 * bundles nothing and defaults `CHROMIUM_PATH` to `/usr/bin/chromium` — a path
 * that does not exist on macOS, so every spawned run failed at browser launch
 * unless the operator had already exported the variable. Hand the runner the
 * browser we already have.
 *
 * `executablePath()` is typed as returning a string but resolves to a Promise
 * under Bun, so this awaits it rather than reading it directly — a synchronous
 * read yields a Promise object, fails the string check, and silently supplies
 * no path at all.
 */

import puppeteer from "puppeteer";

let cached: string | null | undefined;

export async function resolveChromiumPath(): Promise<string | null> {
  if (cached !== undefined) return cached;

  const configured = process.env["CHROMIUM_PATH"];
  if (configured) {
    cached = configured;
    return cached;
  }

  try {
    const path = await Promise.resolve(puppeteer.executablePath());
    cached = typeof path === "string" && path ? path : null;
  } catch {
    // No downloaded browser — leave the runner to its own default.
    cached = null;
  }
  return cached;
}

/**
 * Env additions for a spawned runner: `CHROMIUM_PATH` when we can supply one,
 * nothing when we cannot.
 */
export async function chromiumEnv(): Promise<Record<string, string>> {
  const path = await resolveChromiumPath();
  return path ? { CHROMIUM_PATH: path } : {};
}
