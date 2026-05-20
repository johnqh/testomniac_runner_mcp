import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, createAdapter } from "../browser-session.ts";
import {
  createDefaultExpertises,
  detectScaffoldRegions,
  type ExpertiseContext,
} from "@sudobility/testomniac_runner_service";

async function buildMinimalContext(page: Awaited<ReturnType<typeof getPage>>): Promise<ExpertiseContext> {
  const adapter = createAdapter(page);
  const html = await page.content();
  const url = page.url();
  const scaffolds = await detectScaffoldRegions(adapter);
  const artifacts = adapter.getRuntimeArtifacts?.() ?? { consoleLogs: [], networkLogs: [] };

  return {
    html,
    initialHtml: html,
    scaffolds,
    patterns: [],
    consoleLogs: artifacts.consoleLogs,
    networkLogs: artifacts.networkLogs as ExpertiseContext["networkLogs"],
    expectations: [],
    initialUrl: url,
    currentUrl: url,
    initialUiSnapshot: {} as ExpertiseContext["initialUiSnapshot"],
    finalUiSnapshot: {} as ExpertiseContext["finalUiSnapshot"],
    initialControlStates: [],
    finalControlStates: [],
  };
}

export function registerExpertiseTools(server: McpServer) {
  server.tool(
    "run_all_expertises",
    "Run all expertise evaluations on the current page. Best-effort: some checks require full test context and may be skipped. Returns findings from SEO, Security, Content, UI, Performance, and Accessibility modules.",
    {},
    async () => {
      const page = await getPage();
      const context = await buildMinimalContext(page);
      const expertises = createDefaultExpertises();

      const allFindings: Array<{ expertise: string; findings: unknown[] }> = [];

      for (const expertise of expertises) {
        try {
          const outcomes = expertise.evaluate(context);
          allFindings.push({ expertise: expertise.name, findings: outcomes });
        } catch (err) {
          allFindings.push({
            expertise: expertise.name,
            findings: [{ error: err instanceof Error ? err.message : "Evaluation failed" }],
          });
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(allFindings, null, 2) }],
      };
    }
  );

  server.tool(
    "run_expertise",
    "Run a specific expertise evaluation on the current page",
    {
      expertise: z
        .enum(["tester", "seo", "security", "performance", "content", "ui", "accessibility"])
        .describe("Which expertise module to run"),
    },
    async ({ expertise: expertiseName }) => {
      const page = await getPage();
      const context = await buildMinimalContext(page);
      const allExpertises = createDefaultExpertises();
      const selected = allExpertises.find((e) => e.name.toLowerCase().includes(expertiseName));

      if (!selected) {
        return {
          content: [{ type: "text", text: `Unknown expertise: ${expertiseName}` }],
          isError: true,
        };
      }

      try {
        const outcomes = selected.evaluate(context);
        return {
          content: [{ type: "text", text: JSON.stringify(outcomes, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Expertise evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
