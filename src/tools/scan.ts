import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureBrowser, createAdapter } from "../browser-session.ts";
import { getConfiguredApiClient, createDiscoveryRun } from "../api-config.ts";
import { spawnRunner } from "../runner-process.ts";
import {
  runTestRun,
  runSequenceRun,
  createDefaultExpertises,
  SizeClass,
  type ScanEventHandler,
  type ScanResult,
  type SequenceRunResult,
} from "@sudobility/testomniac_runner_service";

export function registerScanTools(server: McpServer) {
  server.tool(
    "run_full_scan",
    "Execute a full Testomniac discovery scan in-process. Launches browser, crawls pages, extracts elements, runs expertises, and records findings. Requires the Testomniac API (set via set_api_key or environment variables).",
    {
      testRunId: z.number().optional().describe("The test run ID (from the API). If omitted, a new discovery run is created automatically."),
      runnerId: z.number().optional().describe("The runner ID (from the API). If omitted, created automatically with the discovery run."),
      baseUrl: z.string().describe("Base URL of the site to scan (e.g. https://example.com)"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
    },
    async ({ testRunId, runnerId, baseUrl, sizeClass }) => {
      // Auto-create discovery run if IDs not provided
      if (testRunId == null || runnerId == null) {
        try {
          const discovery = await createDiscoveryRun(baseUrl);
          testRunId = discovery.testRunId;
          runnerId = discovery.runnerId;
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
      }

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
      const personas: Array<{ id: number; title: string; description: string }> = [];
      const eventHandler: ScanEventHandler = {
        onPageFound: (p) => events.push(`Page found: ${p.relativePath}`),
        onPageStateCreated: (s) => events.push(`Page state created: ${s.pageStateId}`),
        onTestSurfaceCreated: (s) => events.push(`Surface created: ${s.title}`),
        onTestInteractionRunCompleted: (r) =>
          events.push(`Interaction run ${r.testInteractionRunId}: ${r.passed ? "PASS" : "FAIL"}`),
        onTestRunCompleted: (r) =>
          events.push(`Test run ${r.testRunId}: ${r.passed ? "PASS" : "FAIL"}`),
        onFindingCreated: (f) => events.push(`Finding [${f.type}]: ${f.title}`),
        onStatsUpdated: () => {},
        onScreenshotCaptured: () => {},
        onScanComplete: (s) => events.push(`Scan complete: ${s.totalPages} pages, ${s.totalFindings} findings`),
        onPersonasDetected: (p) => {
          personas.push(...p);
          events.push(`Personas detected: ${p.map(x => x.title).join(", ")}`);
        },
        onError: (e) => events.push(`Error: ${e.message}`),
      };

      const instanceId = crypto.randomUUID();

      let result: ScanResult;
      try {
        result = await runTestRun(
          adapter,
          {
            testRunId,
            runnerId,
            baseUrl,
            sizeClass: sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
            runnerInstanceId: instanceId,
            runnerInstanceName: "mcp-runner",
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
            text: JSON.stringify({ result, events, personas }, null, 2),
          },
        ],
      };
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
    },
    async ({ runId, runnerId, baseUrl, sizeClass }) => {
      const logs: string[] = [];
      try {
        const { done } = spawnRunner({
          runId,
          runnerId,
          baseUrl,
          sizeClass,
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
