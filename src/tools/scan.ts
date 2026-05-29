import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureBrowser, createAdapter } from "../browser-session.ts";
import {
  getConfiguredApiClient,
  createDiscoveryRun,
  getApiConfig,
} from "../api-config.ts";
import { spawnRunner } from "../runner-process.ts";
import { ensureRunnerDaemon } from "../runner-daemon.ts";
import {
  runSequenceRun,
  createDefaultExpertises,
  SizeClass,
  type ScanEventHandler,
  type SequenceRunResult,
} from "@sudobility/testomniac_runner_service";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000; // 10 minutes

function log(msg: string) {
  console.error(`[testomniac] ${msg}`);
}

interface TestRunStatus {
  id: number;
  status: string;
  pagesFound: number | null;
  pageStatesFound: number | null;
  testRunsCompleted: number | null;
  totalDurationMs: number | null;
  scanUrl: string | null;
}

async function pollTestRun(
  testRunId: number
): Promise<TestRunStatus> {
  const { apiUrl, apiKey } = getApiConfig();
  if (!apiUrl || !apiKey) throw new Error("API not configured");

  const headers: Record<string, string> = {
    "X-Scanner-Key": apiKey,
  };

  const start = Date.now();
  let lastPagesFound = 0;
  let lastTestRunsCompleted = 0;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(`${apiUrl}/api/v1/scanner/test-runs/${testRunId}`, {
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
    if (pages !== lastPagesFound || completed !== lastTestRunsCompleted) {
      log(
        `Run ${testRunId}: ${run.status} — ${pages} pages, ${completed} interactions completed`
      );
      lastPagesFound = pages;
      lastTestRunsCompleted = completed;
    }

    if (run.status === "completed" || run.status === "failed") {
      log(
        `Run ${testRunId}: ${run.status} in ${run.totalDurationMs ?? Date.now() - start}ms — ${pages} pages found`
      );
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
          "Scan depth: 'full' runs all interactions (default), 'partial' skips redundant hover tests, 'minimum' only navigates pages without interaction testing"
        ),
    },
    async ({ baseUrl, sizeClass, scanMode }) => {
      // Step 1: Create discovery run via API
      let discovery;
      try {
        log(`Creating discovery scan for ${baseUrl}...`);
        discovery = await createDiscoveryRun(baseUrl, {
          sizeClass,
          scanMode: scanMode ?? "full",
        });
        log(
          `Scan created: testRunId=${discovery.testRunId}, runnerId=${discovery.runnerId}`
        );
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
        ensureRunnerDaemon();
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
        log("Waiting for runner to pick up the scan...");
        const run = await pollTestRun(discovery.testRunId);

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
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  testRunId: discovery.testRunId,
                  runnerId: discovery.runnerId,
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
    async ({ sequenceRunId, runnerId, sizeClass }) => {
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
      const eventHandler: ScanEventHandler = {
        onPageFound: (p) => events.push(`Page found: ${p.relativePath}`),
        onPageStateCreated: (s) => events.push(`Page state created: ${s.pageStateId}`),
        onTestSurfaceCreated: (s) => events.push(`Surface created: ${s.title}`),
        onTestInteractionRunCompleted: (r) =>
          events.push(`Step ${r.testInteractionRunId}: ${r.passed ? "PASS" : "FAIL"}`),
        onTestRunCompleted: (r) =>
          events.push(`Test run ${r.testRunId}: ${r.passed ? "PASS" : "FAIL"}`),
        onFindingCreated: (f) => events.push(`Finding [${f.type}]: ${f.title}`),
        onStatsUpdated: () => {},
        onScreenshotCaptured: () => {},
        onScanComplete: () => {},
        onError: (e) => events.push(`Error: ${e.message}`),
      };

      let result: SequenceRunResult;
      try {
        result = await runSequenceRun(
          adapter,
          {
            sequenceRunId,
            runnerId,
            runnerInstanceId: crypto.randomUUID(),
            runnerInstanceName: "mcp-runner",
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
        const { done } = spawnRunner({
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
        const { done } = spawnRunner({
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
}
