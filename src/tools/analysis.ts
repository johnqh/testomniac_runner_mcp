import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, getAdapter } from "../browser-session.ts";
import {
  extractActionableItems,
  extractForms,
  detectLoginPage,
  evaluatePageHealth,
  buildDomSnapshot,
  detectScaffoldRegions,
  detectPatternsWithInstances,
  decomposeHtml,
} from "@sudobility/testomniac_runner_service";

export function registerAnalysisTools(server: McpServer) {
  server.tool(
    "extract_actionable_items",
    "Extract interactive elements from the current page: buttons, links, inputs, forms, selects, toggles",
    {},
    async () => {
      const adapter = await getAdapter();
      const items = await extractActionableItems(adapter);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    }
  );

  server.tool(
    "extract_forms",
    "Extract and analyze all forms on the current page with their fields and validation",
    {},
    async () => {
      const adapter = await getAdapter();
      const forms = await extractForms(adapter);
      return {
        content: [{ type: "text", text: JSON.stringify(forms, null, 2) }],
      };
    }
  );

  server.tool(
    "detect_login_page",
    "Detect whether the current page is a login/sign-in page and identify SSO buttons",
    {},
    async () => {
      const adapter = await getAdapter();
      const url = adapter.url();
      const forms = await extractForms(adapter);
      const result = await detectLoginPage(adapter, url, forms);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "evaluate_page_health",
    "Check for common page health issues: broken images, dead links, overlaps, console errors",
    {},
    async () => {
      const adapter = await getAdapter();
      const issues = await evaluatePageHealth(adapter);
      return {
        content: [{ type: "text", text: JSON.stringify(issues, null, 2) }],
      };
    }
  );

  server.tool(
    "build_dom_snapshot",
    "Build a structured DOM snapshot of the current page for analysis",
    {},
    async () => {
      const adapter = await getAdapter();
      const snapshot = await buildDomSnapshot(adapter);
      return {
        content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }],
      };
    }
  );

  server.tool(
    "detect_scaffolds",
    "Detect reusable scaffolds (headers, footers, sidebars, navigation) on the current page",
    {},
    async () => {
      const adapter = await getAdapter();
      const regions = await detectScaffoldRegions(adapter);
      return {
        content: [{ type: "text", text: JSON.stringify(regions, null, 2) }],
      };
    }
  );

  server.tool(
    "decompose_page",
    "Decompose the current page into content body, scaffold regions (headers, footers, sidebars), and UI patterns (cards, tables, modals). Returns the structural breakdown of the page.",
    {},
    async () => {
      const adapter = await getAdapter();
      const html = await adapter.content();

      // Extract body HTML
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyHtml = bodyMatch?.[1] ?? html;

      // Detect scaffolds and decompose
      const scaffolds = await detectScaffoldRegions(adapter);
      const decomposed = decomposeHtml(bodyHtml, scaffolds);

      // Detect UI patterns
      const patterns = await detectPatternsWithInstances(adapter);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                bodyHtml: decomposed.bodyHtml,
                contentHtml: decomposed.contentHtml,
                scaffolds: decomposed.regions,
                patterns: patterns.map((p) => ({
                  type: p.type,
                  selector: p.selector,
                  count: p.count,
                  instances: p.instances,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
