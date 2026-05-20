#!/usr/bin/env bun
/**
 * Testomniac Runner MCP Server
 *
 * Gives AI assistants direct browser control and test execution capabilities.
 * Wraps Puppeteer + the testomniac_runner_service library.
 *
 * Environment variables:
 *   CHROMIUM_PATH         - Path to Chromium executable (default: /usr/bin/chromium)
 *   TESTOMNIAC_API_URL    - Base URL of the API (required for full scans)
 *   TESTOMNIAC_API_KEY    - Scanner API key (required for full scans)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBrowserTools } from "./tools/browser.ts";
import { registerAnalysisTools } from "./tools/analysis.ts";
import { registerTestGenerationTools } from "./tools/test-generation.ts";
import { registerExpertiseTools } from "./tools/expertise.ts";
import { registerScanTools } from "./tools/scan.ts";
import { closeBrowser } from "./browser-session.ts";

const server = new McpServer({
  name: "testomniac-runner",
  version: "0.1.0",
});

// Register all tool groups
registerBrowserTools(server);
registerAnalysisTools(server);
registerTestGenerationTools(server);
registerExpertiseTools(server);
registerScanTools(server);

// Cleanup on exit
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
