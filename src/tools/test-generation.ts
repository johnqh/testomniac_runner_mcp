import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateRenderTest,
  generateNavigationTest,
  generateE2ETest,
  generateInteractionTest,
  generateFormTest,
  SizeClass,
} from "@sudobility/testomniac_runner_service";

export function registerTestGenerationTools(server: McpServer) {
  server.tool(
    "generate_render_test",
    "Generate a page load/render test definition",
    {
      pageId: z.number().describe("Page ID from the API"),
      pageStateId: z.number().describe("Page state ID from the API"),
      pageName: z.string().describe("Display name of the page"),
      url: z.string().describe("URL of the page"),
      sizeClass: z.enum(["desktop", "mobile"]).optional().describe("Device class (default: desktop)"),
      priority: z.number().optional().describe("Priority (1=highest, default: 5)"),
    },
    async ({ pageId, pageStateId, pageName, url, sizeClass, priority }) => {
      const test = generateRenderTest({
        pageId,
        pageStateId,
        pageName,
        url,
        sizeClass: sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
        priority: priority ?? 5,
        elements: [],
      });
      return {
        content: [{ type: "text", text: JSON.stringify(test, null, 2) }],
      };
    }
  );

  server.tool(
    "generate_navigation_test",
    "Generate a navigation test verifying a link leads to the expected destination",
    {
      fromPageName: z.string().describe("Source page name"),
      toPageName: z.string().describe("Destination page name"),
      fromUrl: z.string().describe("Source URL"),
      toUrl: z.string().describe("Expected destination URL"),
      triggerSelector: z.string().describe("CSS selector of the link/button"),
      sizeClass: z.enum(["desktop", "mobile"]).optional().describe("Device class"),
      priority: z.string().optional().describe("Priority level (default: medium)"),
    },
    async ({ fromPageName, toPageName, fromUrl, toUrl, triggerSelector, sizeClass, priority }) => {
      const test = generateNavigationTest({
        fromPageName,
        toPageName,
        fromUrl,
        toUrl,
        sizeClass: sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
        priority: priority ?? "medium",
        triggerSelector,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(test, null, 2) }],
      };
    }
  );

  server.tool(
    "generate_e2e_test",
    "Generate an end-to-end test from a sequence of page navigation steps",
    {
      sizeClass: z.enum(["desktop", "mobile"]).optional().describe("Device class"),
      steps: z.array(z.object({
        pageName: z.string().describe("Name of the page at this step"),
        url: z.string().describe("URL at this step"),
        triggerSelector: z.string().optional().describe("Selector to click to proceed to next step"),
      })).describe("Ordered steps of the E2E flow"),
    },
    async ({ sizeClass, steps }) => {
      const test = generateE2ETest({
        sizeClass: sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
        steps,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(test, null, 2) }],
      };
    }
  );

  server.tool(
    "generate_interaction_test",
    "Generate an element interaction test (click with optional preceding hovers)",
    {
      pageName: z.string().describe("Display name of the page"),
      url: z.string().describe("URL of the page"),
      clickSelector: z
        .string()
        .describe("CSS selector of the element to click"),
      mouseoverSelectors: z
        .array(z.string())
        .optional()
        .describe("CSS selectors to hover before clicking (in order)"),
      expectedUrl: z
        .string()
        .optional()
        .describe("Expected URL after the interaction"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
      priority: z
        .string()
        .optional()
        .describe("Priority level (default: medium)"),
    },
    async ({
      pageName,
      url,
      clickSelector,
      mouseoverSelectors,
      expectedUrl,
      sizeClass,
      priority,
    }) => {
      const test = generateInteractionTest({
        pageName,
        url,
        clickSelector,
        mouseoverSelectors: mouseoverSelectors ?? [],
        expectedUrl,
        sizeClass:
          sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
        priority: priority ?? "medium",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(test, null, 2) }],
      };
    }
  );

  server.tool(
    "generate_form_test",
    "Generate a form submission test with field fills and discrete controls",
    {
      pageName: z.string().describe("Display name of the page"),
      url: z.string().describe("URL of the page"),
      fills: z
        .array(
          z.object({
            selector: z.string().describe("CSS selector of the input field"),
            value: z.string().describe("Value to type into the field"),
          })
        )
        .describe("Text fields to fill"),
      discreteControls: z
        .array(
          z.object({
            selector: z.string().describe("CSS selector of the control"),
            type: z
              .string()
              .describe("Control type (checkbox, radio, select)"),
            value: z.string().describe("Value to set"),
          })
        )
        .optional()
        .describe("Discrete controls: checkboxes, radios, selects"),
      submitSelector: z
        .string()
        .optional()
        .describe("CSS selector of the submit button"),
      personaId: z.number().optional().describe("Persona ID (default: 0)"),
      useCaseId: z.number().optional().describe("Use case ID (default: 0)"),
      sizeClass: z
        .enum(["desktop", "mobile"])
        .optional()
        .describe("Device class (default: desktop)"),
      priority: z
        .string()
        .optional()
        .describe("Priority level (default: medium)"),
    },
    async ({
      pageName,
      url,
      fills,
      discreteControls,
      submitSelector,
      personaId,
      useCaseId,
      sizeClass,
      priority,
    }) => {
      const test = generateFormTest({
        pageName,
        url,
        fills,
        discreteControls: discreteControls ?? [],
        submitSelector,
        personaId: personaId ?? 0,
        useCaseId: useCaseId ?? 0,
        sizeClass:
          sizeClass === "mobile" ? SizeClass.Mobile : SizeClass.Desktop,
        priority: priority ?? "medium",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(test, null, 2) }],
      };
    }
  );
}
