/**
 * Spawns the testomniac_runner as a child process in one-shot mode.
 * The runner executes a specific test run or sequence run and exits.
 */

import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { getApiConfig } from "./api-config.ts";

function getRunnerPath(): string {
  // Resolve from node_modules (installed as file: dependency)
  const candidates = [
    resolve(import.meta.dir, "../node_modules/testomniac_runner/src/index.ts"),
    resolve(import.meta.dir, "../node_modules/testomniac_runner/dist/index.js"),
  ];
  for (const p of candidates) {
    try {
      if (Bun.file(p).size) return p;
    } catch {
      // file doesn't exist, try next
    }
  }
  throw new Error(
    "testomniac_runner not found in node_modules. Run bun install."
  );
}

export interface RunnerProcessOptions {
  runId?: number;
  sequenceRunId?: number;
  runnerId: number;
  baseUrl?: string;
  sizeClass?: string;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export function spawnRunner(options: RunnerProcessOptions): {
  process: ChildProcess;
  done: Promise<{ exitCode: number | null }>;
} {
  const config = getApiConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error(
      "API not configured. Set TESTOMNIAC_API_URL and TESTOMNIAC_API_KEY environment variables, or use the set_api_key tool."
    );
  }

  const runnerPath = getRunnerPath();
  const args = ["run", runnerPath];

  if (options.runId) {
    args.push("--run-id", String(options.runId));
    args.push("--runner-id", String(options.runnerId));
    if (options.baseUrl) args.push("--base-url", options.baseUrl);
    if (options.sizeClass) args.push("--size-class", options.sizeClass);
  } else if (options.sequenceRunId) {
    args.push("--sequence-run-id", String(options.sequenceRunId));
    args.push("--runner-id", String(options.runnerId));
  } else {
    throw new Error("Either runId or sequenceRunId is required");
  }

  const child = spawn("bun", args, {
    env: {
      ...process.env,
      TESTOMNIAC_API_URL: config.apiUrl,
      SCANNER_API_KEY: config.apiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (options.onStdout && child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        options.onStdout!(line);
      }
    });
  }
  if (options.onStderr && child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        options.onStderr!(line);
      }
    });
  }

  const done = new Promise<{ exitCode: number | null }>(resolve => {
    child.on("close", code => resolve({ exitCode: code }));
  });

  return { process: child, done };
}
