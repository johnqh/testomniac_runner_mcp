import { z } from "zod/v4";
import { appendFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { ensureBrowser, createAdapter } from "../browser-session.ts";
import {
  getConfiguredApiClient,
  createDiscoveryRun,
  getApiConfig,
} from "../api-config.ts";
import { spawnRunner } from "../runner-process.ts";
import { ensureRunnerDaemon, stopDaemonRun } from "../runner-daemon.ts";
import { getRunnerIdentity } from "../runner-identity.ts";
import {
  runSequenceRun,
  createDefaultExpertises,
  SizeClass,
  type ScanEventHandler,
  type SequenceRunResult,
} from "@sudobility/testomniac_runner_service";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 minutes

const activeScans = new Map<number, { startedAt: number; baseUrl: string }>();

function log(msg: string) {
  console.error(`[testomniac] ${msg}`);
}

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
type StatusReporter = (message: string) => Promise<void>;

function isMeaningfulInteractionStatusUpdate(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (
    lower.includes(" pending") ||
    lower.endsWith("pending") ||
    lower.includes("waiting for runner") ||
    lower.includes("creating discovery scan") ||
    lower.includes("scan created") ||
    lower.includes("starting local runner") ||
    lower.includes("run ") && lower.includes(" pages, ")
  ) {
    return false;
  }

  return /^(navigate|click|hover|type|fill|select|press|submit|scroll|wait|open|check|verify|detect|run|record)\b/i.test(
    normalized
  );
}

function writeTerminalStatus(message: string) {
  const line = `[testomniac] ${message}\n`;
  try {
    appendFileSync("/dev/tty", line);
  } catch {
    // Claude Code may launch MCP servers without a controlling TTY.
  }
}

function createStatusReporter(
  server: McpServer,
  statusUpdates: string[],
  extra?: ToolExtra
): StatusReporter {
  let progress = 0;
  return async (message: string) => {
    if (!isMeaningfulInteractionStatusUpdate(message)) return;

    statusUpdates.push(message);
    log(message);
    writeTerminalStatus(message);

    const progressToken = extra?._meta?.progressToken;
    if (extra && progressToken !== undefined) {
      progress += 1;
      await extra.sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress,
          message,
        },
      });
    }

    await server.sendLoggingMessage(
      {
        level: "info",
        logger: "testomniac",
        data: message,
      },
      extra?.sessionId
    );
  };
}

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

async function pollTestRun(
  testRunId: number,
  reportStatus: StatusReporter
): Promise<TestRunStatus> {
  const { apiUrl, apiKey } = getApiConfig();
  if (!apiUrl || !apiKey) throw new Error("API not configured");

  const headers: Record<string, string> = {
    "X-Scanner-Key": apiKey,
  };

  const start = Date.now();
  let lastPagesFound = 0;
  let lastTestRunsCompleted = 0;
  let lastStatusMessage = "";

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(`${apiUrl}/api/v1/test-runs/${testRunId}`, {
      headers,
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

    // Log progress when it changes
    const pages = run.pagesFound ?? 0;
    const completed = run.testRunsCompleted ?? 0;
    const statusMessage = run.status_update ?? "";
    if (statusMessage && statusMessage !== lastStatusMessage) {
      await reportStatus(statusMessage);
      lastStatusMessage = statusMessage;
    }
    if (pages !== lastPagesFound || completed !== lastTestRunsCompleted) {
      lastPagesFound = pages;
      lastTestRunsCompleted = completed;
    }

    if (run.status === "completed" || run.status === "failed" || run.status === "stopped") {
      return run;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Scan timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

export function registerScanTools(server: McpServer) {
  server.tool(
    "run_full_scan",
    "Create a Testomniac discovery scan via the API. A separate runner process picks up the scan and executes it. This tool polls until the run completes and returns results. Requires the Testomniac API (set via set_api_key or environment variables).",
    {
      baseUrl: z
        .string()
        .describe("Base URL of the site to scan (e.g. https://example.com)"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
      scanMode: z
        .enum(["full", "partial", "minimum"])
        .optional()
        .describe(
          "Scan depth: 'full' runs all interactions, 'partial' skips redundant hover tests, 'minimum' only navigates pages without interaction testing. Defaults server-side to 'partial' when quickScan is set, otherwise 'full'."
        ),
      quickScan: z
        .boolean()
        .optional()
        .describe("Shallow single-pass scan; implies scanMode 'partial'"),
      scanScopePath: z
        .string()
        .optional()
        .describe("Restrict discovery to URLs under this path (e.g. '/docs')"),
      expertiseSlugs: z
        .array(z.string())
        .optional()
        .describe(
          "Limit checks to these expertises (e.g. ['accessibility','seo']). 'tester' is always included by the server."
        ),
      loginUrl: z
        .string()
        .optional()
        .describe("URL of the login page, if the site needs authenticating"),
      entityCredentialId: z
        .number()
        .optional()
        .describe("Stored entity credential to log in with"),
      reportEmail: z
        .string()
        .optional()
        .describe("Email address to send the finished report to"),
      captureApi: z
        .boolean()
        .optional()
        .describe(
          "Send the site's API traffic to the graph service. Off unless explicitly asked for — request and response bodies leave the runner."
        ),
    },
    async ({ baseUrl, ...scanOptions }, extra) => {
      const statusUpdates: string[] = [];
      const reportStatus = createStatusReporter(server, statusUpdates, extra);
      // Step 1: Create discovery run via API
      let discovery;
      try {
        await reportStatus(`Creating discovery scan for ${baseUrl}...`);
        discovery = await createDiscoveryRun(baseUrl, scanOptions);
        await reportStatus(
          `Scan created: testRunId=${discovery.testRunId}, runnerId=${discovery.runnerId}`
        );
        if (discovery.status_update) {
          await reportStatus(discovery.status_update);
        }
        activeScans.set(discovery.testRunId, {
          startedAt: Date.now(),
          baseUrl,
        });
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to create discovery run: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      // Step 2: Ensure runner daemon is running
      try {
        await ensureRunnerDaemon();
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to start runner: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }

      // Step 3: Poll until the runner picks it up and completes
      try {
        await reportStatus("Waiting for runner to pick up the scan...");
        const run = await pollTestRun(discovery.testRunId, reportStatus);
        activeScans.delete(discovery.testRunId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  testRunId: discovery.testRunId,
                  runnerId: discovery.runnerId,
                  productId: discovery.productId,
                  testEnvironmentId: discovery.testEnvironmentId,
                  status: run.status,
                  status_update: run.status_update ?? null,
                  status_updates: statusUpdates,
                  pagesFound: run.pagesFound ?? 0,
                  pageStatesFound: run.pageStatesFound ?? 0,
                  testRunsCompleted: run.testRunsCompleted ?? 0,
                  totalDurationMs: run.totalDurationMs,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        activeScans.delete(discovery.testRunId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  testRunId: discovery.testRunId,
                  runnerId: discovery.runnerId,
                  status_updates: statusUpdates,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "run_sequence",
    "Execute a test scenario sequence in-process using the active browser session. Runs each pre-defined interaction step in order. After completion, the browser remains on the final page so you can inspect state, determine if the flow goal was reached, and continue with additional interactions if needed.",
    {
      sequenceRunId: z.number().describe("The sequence run ID to execute"),
      runnerId: z.number().describe("Runner ID"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
    },
    async ({ sequenceRunId, runnerId, sizeClass }, extra) => {
      const statusUpdates: string[] = [];
      const reportStatus = createStatusReporter(server, statusUpdates, extra);
      let api;
      try {
        api = getConfiguredApiClient();
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "API not configured. Set TESTOMNIAC_API_URL and TESTOMNIAC_USER_API_KEY environment variables, or use the set_api_key tool first.",
            },
          ],
          isError: true,
        };
      }

      const page = await ensureBrowser();
      const adapter = createAdapter(page);
      const expertises = createDefaultExpertises();

      const events: string[] = [];
      const eventHandler: ScanEventHandler & {
        onStatusUpdate?: (update: { message: string; testRunId?: number }) => void;
      } = {
        onPageFound: (p) => {
          const message = `Page found: ${p.relativePath}`;
          events.push(message);
          void reportStatus(message);
        },
        onPageStateCreated: (s) => {
          const message = `Page state created: ${s.pageStateId}`;
          events.push(message);
          void reportStatus(message);
        },
        onTestSurfaceCreated: (s) => {
          const message = `Surface created: ${s.title}`;
          events.push(message);
          void reportStatus(message);
        },
        onTestInteractionRunCompleted: (r) => {
          const message = `Step ${r.testInteractionRunId}: ${r.passed ? "PASS" : "FAIL"}`;
          events.push(message);
          void reportStatus(message);
        },
        onTestRunCompleted: (r) => {
          const message = `Test run ${r.testRunId}: ${r.passed ? "PASS" : "FAIL"}`;
          events.push(message);
          void reportStatus(message);
        },
        onFindingCreated: (f) => {
          const message = `Finding [${f.type}]: ${f.title}`;
          events.push(message);
          void reportStatus(message);
        },
        onStatsUpdated: () => {},
        onStatusUpdate: update => {
          events.push(`Status: ${update.message}`);
          void reportStatus(update.message);
        },
        onScreenshotCaptured: () => {},
        onScanComplete: () => {},
        onError: (e) => {
          const message = `Error: ${e.message}`;
          events.push(message);
          void reportStatus(message);
        },
      };

      let result: SequenceRunResult;
      try {
        const identity = getRunnerIdentity();
        result = await runSequenceRun(
          adapter,
          {
            sequenceRunId,
            runnerId,
            runnerInstanceId: identity.id,
            runnerInstanceName: identity.name,
            sizeClass: sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
          },
          api,
          expertises,
          eventHandler
        );
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  currentUrl: page.url(),
                  events,
                  status_updates: statusUpdates,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...result,
                currentUrl: page.url(),
                allStepsPassed: result.interactionsFailed === 0,
                events,
                status_updates: statusUpdates,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "execute_run",
    "Execute a test run locally using the bundled runner process. The runner spawns as a separate process with its own browser, executes the specific run, and exits. Use this for local development instead of relying on a server-side runner.",
    {
      runId: z.number().describe("Test run ID to execute"),
      runnerId: z.number().describe("Runner ID"),
      baseUrl: z.string().describe("Base URL of the site to test"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
      scanMode: z
        .enum(["full", "partial", "minimum"])
        .optional()
        .describe("Scan depth to pass to the local runner for this run"),
    },
    async ({ runId, runnerId, baseUrl, sizeClass, scanMode }) => {
      const logs: string[] = [];
      try {
        const { done } = await spawnRunner({
          runId,
          runnerId,
          baseUrl,
          sizeClass,
          scanMode,
          onStdout: line => logs.push(line),
          onStderr: line => logs.push(`[err] ${line}`),
        });
        const { exitCode } = await done;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { exitCode, success: exitCode === 0, logs },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  logs,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "execute_sequence",
    "Execute a test sequence run locally using the bundled runner process. Spawns a runner that executes the ordered test interactions in the sequence and exits.",
    {
      sequenceRunId: z.number().describe("The sequence run ID to execute"),
      runnerId: z.number().describe("Runner ID"),
    },
    async ({ sequenceRunId, runnerId }) => {
      const logs: string[] = [];
      try {
        const { done } = await spawnRunner({
          sequenceRunId,
          runnerId,
          onStdout: line => logs.push(line),
          onStderr: line => logs.push(`[err] ${line}`),
        });
        const { exitCode } = await done;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { exitCode, success: exitCode === 0, logs },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  logs,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "stop_scan",
    "Stop an active scan gracefully. The current interaction finishes, then remaining work is cancelled and the run is closed out with status 'stopped'. Only reaches scans started by run_full_scan in this session — the signal travels over the runner daemon's stdin, so a one-shot execute_run cannot be stopped this way.",
    {
      testRunId: z
        .number()
        .describe("The test run ID of the active scan to stop"),
    },
    async ({ testRunId }) => {
      if (!activeScans.has(testRunId)) {
        return {
          content: [
            {
              type: "text",
              text: `No active scan found with testRunId=${testRunId}. Use list_active_scans to see running scans.`,
            },
          ],
          isError: true,
        };
      }

      const sent = stopDaemonRun(testRunId);
      if (!sent) {
        return {
          content: [
            {
              type: "text",
              text: "Runner daemon is not running or stdin is not writable. The scan may have already finished.",
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Stop signal sent for testRunId=${testRunId}. The current interaction will finish, then the scan will stop.`,
          },
        ],
      };
    }
  );

  server.tool(
    "list_active_scans",
    "List the scans run_full_scan started in this session and has not yet seen finish. Scans started elsewhere, or before this server booted, are not tracked here.",
    {},
    async () => {
      const scans = Array.from(activeScans.entries()).map(
        ([testRunId, info]) => ({
          testRunId,
          baseUrl: info.baseUrl,
          startedAt: new Date(info.startedAt).toISOString(),
          elapsedMs: Date.now() - info.startedAt,
        })
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(scans, null, 2),
          },
        ],
      };
    }
  );
}
