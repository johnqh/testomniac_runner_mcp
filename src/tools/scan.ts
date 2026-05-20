import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureBrowser, createAdapter } from "../browser-session.ts";
import {
  runTestRun,
  getApiClient,
  createDefaultExpertises,
  SizeClass,
  type ScanEventHandler,
  type ScanResult,
} from "@sudobility/testomniac_runner_service";

export function registerScanTools(server: McpServer) {
  server.tool(
    "run_full_scan",
    "Execute a full Testomniac discovery scan on a URL. Launches browser, crawls pages, extracts elements, runs expertises, and records findings. Requires the Testomniac API to be running.",
    {
      testRunId: z.number().describe("The test run ID (from the API)"),
      runnerId: z.number().describe("The runner ID (from the API)"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
    },
    async ({ testRunId, runnerId, sizeClass }) => {
      const apiUrl = process.env["TESTOMNIAC_API_URL"];
      const apiKey = process.env["TESTOMNIAC_API_KEY"];

      if (!apiUrl || !apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "TESTOMNIAC_API_URL and TESTOMNIAC_API_KEY are required for full scans.",
            },
          ],
          isError: true,
        };
      }

      const page = await ensureBrowser();
      const adapter = createAdapter(page);
      const api = getApiClient(apiUrl, apiKey);
      const expertises = createDefaultExpertises();

      const events: string[] = [];
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
            baseUrl: apiUrl,
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
            text: JSON.stringify({ result, events }, null, 2),
          },
        ],
      };
    }
  );
}
