import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setApiConfig, getApiConfig } from "../api-config.ts";

export function registerConfigTools(server: McpServer) {
  server.tool(
    "set_api_key",
    "Set the API key for connecting to the Testomniac API. Use a master key (shared with testomniac_api on the server) or a user-defined entity API key (for local development). Without this, the TESTOMNIAC_API_KEY environment variable is used.",
    {
      apiKey: z
        .string()
        .describe(
          "The Testomniac API key — either a master key or an entity API key (tst_...)"
        ),
      apiUrl: z
        .string()
        .optional()
        .describe(
          "Override the Testomniac API URL (default: TESTOMNIAC_API_URL env var)"
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
