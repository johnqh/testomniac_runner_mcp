import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureBrowser, getPage, closeBrowser, isBrowserActive, createAdapter } from "../browser-session.ts";

export function registerBrowserTools(server: McpServer) {
  server.tool(
    "browser_launch",
    "Launch a headless browser. Must be called before navigation or interaction tools.",
    {
      width: z.number().optional().describe("Viewport width (default: 1280)"),
      height: z.number().optional().describe("Viewport height (default: 800)"),
    },
    async ({ width, height }) => {
      const page = await ensureBrowser();
      if (width || height) {
        await page.setViewport({ width: width ?? 1280, height: height ?? 800 });
      }
      return {
        content: [{ type: "text", text: "Browser launched and ready." }],
      };
    }
  );

  server.tool(
    "browser_close",
    "Close the browser and free resources",
    {},
    async () => {
      await closeBrowser();
      return { content: [{ type: "text", text: "Browser closed." }] };
    }
  );

  server.tool(
    "browser_status",
    "Check if the browser is currently active",
    {},
    async () => {
      const active = isBrowserActive();
      const page = active ? await getPage() : null;
      const url = page ? page.url() : null;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ active, currentUrl: url }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_navigate",
    "Navigate the browser to a URL",
    {
      url: z.string().describe("The URL to navigate to"),
      waitUntil: z
        .enum(["load", "domcontentloaded", "networkidle0", "networkidle2"])
        .optional()
        .describe("Wait condition (default: load)"),
    },
    async ({ url, waitUntil }) => {
      const page = await getPage();
      await page.goto(url, {
        waitUntil: waitUntil ?? "load",
        timeout: 30000,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { url: page.url(), title: await page.title() },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_click",
    "Click an element by CSS selector",
    {
      selector: z.string().describe("CSS selector of the element to click"),
    },
    async ({ selector }) => {
      const page = await getPage();
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      return {
        content: [{ type: "text", text: `Clicked: ${selector}` }],
      };
    }
  );

  server.tool(
    "browser_type",
    "Type text into an input field",
    {
      selector: z.string().describe("CSS selector of the input field"),
      text: z.string().describe("Text to type"),
      clear: z.boolean().optional().describe("Clear the field first (default: true)"),
    },
    async ({ selector, text, clear }) => {
      const page = await getPage();
      await page.waitForSelector(selector, { timeout: 5000 });
      if (clear !== false) {
        await page.click(selector, { count: 3 });
      }
      await page.type(selector, text);
      return {
        content: [{ type: "text", text: `Typed into ${selector}` }],
      };
    }
  );

  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current page",
    {
      fullPage: z.boolean().optional().describe("Capture full page (default: false)"),
    },
    async ({ fullPage }) => {
      const page = await getPage();
      const buffer = await page.screenshot({
        type: "png",
        fullPage: fullPage ?? false,
      });
      return {
        content: [
          {
            type: "image",
            data: Buffer.from(buffer).toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    }
  );

  server.tool(
    "browser_get_content",
    "Get the current page HTML content",
    {},
    async () => {
      const page = await getPage();
      const html = await page.content();
      return { content: [{ type: "text", text: html }] };
    }
  );

  server.tool(
    "browser_evaluate",
    "Execute JavaScript on the page and return the result",
    {
      script: z.string().describe("JavaScript code to execute in the page context"),
    },
    async ({ script }) => {
      const page = await getPage();
      const result = await page.evaluate(script);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) ?? "undefined" },
        ],
      };
    }
  );

  server.tool(
    "browser_get_logs",
    "Get console and network logs from the current session",
    {},
    async () => {
      const page = await getPage();
      const adapter = createAdapter(page);
      const artifacts = adapter.getRuntimeArtifacts?.();
      return {
        content: [
          { type: "text", text: JSON.stringify(artifacts ?? { consoleLogs: [], networkLogs: [] }, null, 2) },
        ],
      };
    }
  );
}
