/**
 * Centralized API configuration.
 * Supports runtime override via set_api_key tool,
 * falls back to environment variables.
 * Persists the API key to .mcp.json so it survives restarts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApiClient } from "@sudobility/testomniac_runner_service";

const mcpJsonPath = resolve(import.meta.dir, "../.mcp.json");

function loadConfigFromMcpJson():
  | { apiUrl?: string; apiKey?: string }
  | undefined {
  try {
    const raw = readFileSync(mcpJsonPath, "utf-8");
    const mcp = JSON.parse(raw) as {
      mcpServers?: {
        "testomniac-runner"?: {
          env?: {
            TESTOMNIAC_API_URL?: string;
            TESTOMNIAC_USER_API_KEY?: string;
          };
        };
      };
    };
    const env = mcp.mcpServers?.["testomniac-runner"]?.env;
    return {
      apiUrl: env?.TESTOMNIAC_API_URL,
      apiKey: env?.TESTOMNIAC_USER_API_KEY,
    };
  } catch {
    return undefined;
  }
}

const mcpConfig = loadConfigFromMcpJson();

let apiUrl: string | undefined =
  process.env["TESTOMNIAC_API_URL"] ||
  mcpConfig?.apiUrl ||
  "https://api.testomniac.com";
let apiKey: string | undefined =
  process.env["TESTOMNIAC_USER_API_KEY"] || mcpConfig?.apiKey;
let client: ApiClient | null = null;

export function setApiConfig(config: { apiUrl?: string; apiKey?: string }) {
  if (config.apiUrl !== undefined) apiUrl = config.apiUrl;
  if (config.apiKey !== undefined) apiKey = config.apiKey;
  client = null; // force re-creation with new config
  persistToMcpJson();
}

function persistToMcpJson() {
  try {
    const raw = readFileSync(mcpJsonPath, "utf-8");
    const mcp = JSON.parse(raw);
    const server = mcp.mcpServers?.["testomniac-runner"];
    if (!server) return;
    if (!server.env) server.env = {};
    if (apiUrl !== undefined) server.env.TESTOMNIAC_API_URL = apiUrl;
    if (apiKey !== undefined) server.env.TESTOMNIAC_USER_API_KEY = apiKey;
    writeFileSync(mcpJsonPath, JSON.stringify(mcp, null, 2) + "\n");
  } catch {
    // non-fatal — key still works in memory for this session
  }
}

export function getApiConfig(): {
  apiUrl: string | undefined;
  apiKey: string | undefined;
} {
  return { apiUrl, apiKey };
}

/**
 * Call POST /api/v1/scan to create a discovery run.
 * This is the high-level endpoint (not the scanner API) that bootstraps
 * the product, runner, environment, and test run in one call.
 * Passes the entity API key via x-api-key header when available.
 */
export async function createDiscoveryRun(
  baseUrl: string,
  options: {
    sizeClass?: "desktop" | "mobile";
    scanMode?: "full" | "partial" | "minimum";
  } = {}
): Promise<{
  testRunId: number;
  runnerId: number;
  productId: number;
  testEnvironmentId: number;
  status_update?: string;
}> {
  if (!apiUrl) {
    throw new Error(
      "API URL not configured. Set TESTOMNIAC_API_URL environment variable, or use the set_api_key tool."
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  const res = await fetch(`${apiUrl}/api/v1/scan`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: baseUrl,
      ...(options.sizeClass ? { sizeClass: options.sizeClass } : {}),
      ...(options.scanMode ? { scanMode: options.scanMode } : {}),
    }),
  });
  const json = (await res.json()) as {
    success: boolean;
    error?: string;
    data?: {
      testRunId: number;
      runnerId: number;
      productId: number;
      testEnvironmentId: number;
      status_update?: string;
    };
  };
  if (!json.success || !json.data) {
    throw new Error(`Failed to create discovery run: ${json.error ?? res.statusText}`);
  }
  return json.data;
}

/**
 * Returns an ApiClient configured with the current apiUrl/apiKey.
 * Throws if either value is missing.
 */
export function getConfiguredApiClient(): ApiClient {
  if (!apiUrl || !apiKey) {
    throw new Error(
      "API not configured. Set TESTOMNIAC_API_URL and TESTOMNIAC_USER_API_KEY environment variables, or use the set_api_key tool."
    );
  }
  if (!client) {
    client = new ApiClient(apiUrl, apiKey);
  }
  return client;
}
