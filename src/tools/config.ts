import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setApiConfig, getApiConfig } from "../api-config.ts";

async function testAuth(apiUrl: string | undefined, apiKey: string) {
  if (!apiUrl) {
    throw new Error("API URL is not configured");
  }

  const res = await fetch(`${apiUrl}/auth/test`, {
    headers: { "X-Api-Key": apiKey },
    cache: "no-store",
  });

  if (res.status === 200) return;
  if (res.status === 401) {
    throw new Error("API key was rejected by the Testomniac API");
  }

  throw new Error(`Auth test failed with HTTP ${res.status}`);
}

export function registerConfigTools(server: McpServer) {
  server.tool(
    "set_api_key",
    "Set and persist the user's Testomniac API key. The key is saved to .mcp.json so it survives restarts. Required before running scans.",
    {
      apiKey: z
        .string()
        .describe(
          "A Testomniac entity API key (tst_...) or global scanner API key"
        ),
      apiUrl: z
        .string()
        .optional()
        .describe(
          "Override the Testomniac API URL (default: https://api.testomniac.com)"
        ),
    },
    async ({ apiKey, apiUrl }) => {
      const currentConfig = getApiConfig();
      const nextApiUrl = apiUrl ?? currentConfig.apiUrl;

      try {
        await testAuth(nextApiUrl, apiKey);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  apiKeySet: false,
                  persisted: false,
                  apiUrl: nextApiUrl ?? "not configured",
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

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
                authTest: "passed",
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
