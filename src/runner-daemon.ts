/**
 * Manages a long-running testomniac_runner process in polling mode.
 * Auto-starts when needed and reuses the same process across scans.
 */

import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { getApiConfig } from "./api-config.ts";
import { getRunnerIdentity } from "./runner-identity.ts";

let runnerProcess: ChildProcess | null = null;
let runnerExitPromise: Promise<number | null> | null = null;

function log(msg: string) {
  console.error(`[testomniac:runner-daemon] ${msg}`);
}

function getRunnerEntrypoint(): string {
  const candidates = [
    resolve(import.meta.dir, "../node_modules/@sudobility/testomniac_runner/src/index.ts"),
    resolve(import.meta.dir, "../node_modules/@sudobility/testomniac_runner/dist/index.js"),
  ];
  for (const p of candidates) {
    try {
      if (Bun.file(p).size) return p;
    } catch {
      // try next
    }
  }
  throw new Error(
    "@sudobility/testomniac_runner not found. Run bun install."
  );
}

function isRunnerAlive(): boolean {
  return runnerProcess !== null && runnerProcess.exitCode === null;
}

/**
 * Ensure the runner daemon is running in polling mode.
 * If already running, this is a no-op.
 * Returns once the process is spawned (not when it exits).
 */
export function ensureRunnerDaemon(): void {
  if (isRunnerAlive()) return;

  const config = getApiConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error(
      "API not configured. Set API key via set_api_key tool first."
    );
  }

  const entrypoint = getRunnerEntrypoint();
  const identity = getRunnerIdentity();
  log(`Starting runner daemon: ${entrypoint}`);

  runnerProcess = spawn("bun", ["run", entrypoint], {
    env: {
      ...process.env,
      TESTOMNIAC_API_URL: config.apiUrl,
      SCANNER_API_KEY: config.apiKey,
      TESTOMNIAC_RUNNER_PROCESS_INSTANCE_ID: identity.id,
      TESTOMNIAC_RUNNER_INSTANCE_NAME: identity.name,
      SCAN_POLL_INTERVAL_MS: "3000",
      MAX_CONCURRENT_RUNNERS: "3",
      LOG_LEVEL: "info",
      // Use a different port so it doesn't conflict
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  runnerProcess.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      log(line);
    }
  });

  runnerProcess.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      log(line);
    }
  });

  runnerExitPromise = new Promise<number | null>((resolve) => {
    runnerProcess!.on("close", (code) => {
      log(`Runner daemon exited with code ${code}`);
      runnerProcess = null;
      runnerExitPromise = null;
      resolve(code);
    });
  });

  log("Runner daemon started");
}

/**
 * Stop the runner daemon if it's running.
 */
export async function stopRunnerDaemon(): Promise<void> {
  if (!isRunnerAlive() || !runnerProcess) return;

  log("Stopping runner daemon...");
  runnerProcess.kill("SIGTERM");

  // Give it a few seconds to shut down gracefully
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  await Promise.race([runnerExitPromise, timeout]);

  if (isRunnerAlive()) {
    runnerProcess?.kill("SIGKILL");
  }

  runnerProcess = null;
  runnerExitPromise = null;
  log("Runner daemon stopped");
}
