import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setApiConfig, getApiConfig } from "../api-config.ts";

export function registerConfigTools(server: McpServer) {
  server.tool(
    "set_api_key",
    "Set and persist the user's Testomniac API key. The key is saved to .mcp.json so it survives restarts. Required before running scans.",
    {
      apiKey: z
        .string()
        .describe(
          "The user's Testomniac entity API key (tst_...)"
        ),
      apiUrl: z
        .string()
        .optional()
        .describe(
          "Override the Testomniac API URL (default: https://api.testomniac.com)"
        ),
    },
    async ({ apiKey, apiUrl }) => {
      setApiConfig({ apiKey, apiUrl });
      const config = getApiConfig();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                apiKeySet: true,
                persisted: true,
                apiUrl: config.apiUrl ?? "not configured",
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
