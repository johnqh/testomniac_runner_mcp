#!/usr/bin/env bun
import {
  createDiscoveryRun,
  getApiConfig,
} from "./api-config.ts";
import {
  ensureRunnerDaemon,
  stopRunnerDaemon,
} from "./runner-daemon.ts";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

interface TestRunStatus {
  id: number;
  status: string;
  pagesFound: number | null;
  pageStatesFound: number | null;
  testRunsCompleted: number | null;
  totalDurationMs: number | null;
  scanUrl: string | null;
  status_update?: string | null;
}

function usage(): never {
  console.error(
    "Usage: bun run src/scan-cli.ts <base-url> [--scan-mode minimum|partial|full] [--size-class desktop|mobile]"
  );
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const baseUrl = args.shift();
  if (!baseUrl || baseUrl.startsWith("--")) usage();

  let scanMode: "full" | "partial" | "minimum" = "full";
  let sizeClass: "desktop" | "mobile" | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (!value) usage();

    if (arg === "--scan-mode") {
      if (!["full", "partial", "minimum"].includes(value)) usage();
      scanMode = value as typeof scanMode;
      i += 1;
    } else if (arg === "--size-class") {
      if (!["desktop", "mobile"].includes(value)) usage();
      sizeClass = value as typeof sizeClass;
      i += 1;
    } else {
      usage();
    }
  }

  return { baseUrl, scanMode, sizeClass };
}

function status(message: string) {
  console.log(`[testomniac] ${message}`);
}

function isMeaningfulInteractionStatusUpdate(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (
    lower.includes(" pending") ||
    lower.endsWith("pending") ||
    lower.includes("waiting for runner") ||
    lower.includes("creating ") ||
    lower.includes("scan created") ||
    lower.includes("starting local runner") ||
    (lower.includes("run ") && lower.includes(" pages, "))
  ) {
    return false;
  }

  return /^(navigate|click|hover|type|fill|select|press|submit|scroll|wait|open|check|verify|detect|run|record)\b/i.test(
    normalized
  );
}

function interactionStatus(message: string) {
  if (isMeaningfulInteractionStatusUpdate(message)) {
    status(message);
  }
}

async function pollTestRun(testRunId: number): Promise<TestRunStatus> {
  const { apiUrl, apiKey } = getApiConfig();
  if (!apiUrl || !apiKey) throw new Error("API not configured");

  const start = Date.now();
  let lastPagesFound = 0;
  let lastTestRunsCompleted = 0;
  let lastStatusMessage = "";

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(`${apiUrl}/api/v1/scanner/test-runs/${testRunId}`, {
      headers: { "X-Scanner-Key": apiKey },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: TestRunStatus;
      error?: string;
    };

    if (!json.success || !json.data) {
      throw new Error(
        `Failed to poll test run: ${json.error ?? res.statusText}`
      );
    }

    const run = json.data;
    const pages = run.pagesFound ?? 0;
    const completed = run.testRunsCompleted ?? 0;
    const statusMessage = run.status_update ?? "";

    if (statusMessage && statusMessage !== lastStatusMessage) {
      interactionStatus(statusMessage);
      lastStatusMessage = statusMessage;
    }
    if (pages !== lastPagesFound || completed !== lastTestRunsCompleted) {
      lastPagesFound = pages;
      lastTestRunsCompleted = completed;
    }

    if (run.status === "completed" || run.status === "failed") {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Scan timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function main() {
  const { baseUrl, scanMode, sizeClass } = parseArgs();

  const discovery = await createDiscoveryRun(baseUrl, {
    scanMode,
    sizeClass,
  });
  if (discovery.status_update) interactionStatus(discovery.status_update);

  ensureRunnerDaemon();
  const run = await pollTestRun(discovery.testRunId);

  console.log(
    JSON.stringify(
      {
        testRunId: discovery.testRunId,
        runnerId: discovery.runnerId,
        productId: discovery.productId,
        testEnvironmentId: discovery.testEnvironmentId,
        status: run.status,
        status_update: run.status_update ?? null,
        pagesFound: run.pagesFound ?? 0,
        pageStatesFound: run.pageStatesFound ?? 0,
        testRunsCompleted: run.testRunsCompleted ?? 0,
        totalDurationMs: run.totalDurationMs,
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await stopRunnerDaemon();
}
