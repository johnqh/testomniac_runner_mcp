/**
 * Centralized API configuration.
 * Supports runtime override via set_api_key tool,
 * falls back to environment variables.
 */

import { ApiClient } from "@sudobility/testomniac_runner_service";

let apiUrl: string | undefined = process.env["TESTOMNIAC_API_URL"];
let apiKey: string | undefined = process.env["TESTOMNIAC_API_KEY"];
let client: ApiClient | null = null;

export function setApiConfig(config: { apiUrl?: string; apiKey?: string }) {
  if (config.apiUrl !== undefined) apiUrl = config.apiUrl;
  if (config.apiKey !== undefined) apiKey = config.apiKey;
  client = null; // force re-creation with new config
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
export async function createDiscoveryRun(baseUrl: string): Promise<{
  testRunId: number;
  runnerId: number;
  productId: number;
  testEnvironmentId: number;
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
    body: JSON.stringify({ url: baseUrl }),
  });
  const json = (await res.json()) as {
    success: boolean;
    error?: string;
    data?: { testRunId: number; runnerId: number; productId: number; testEnvironmentId: number };
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
      "API not configured. Set TESTOMNIAC_API_URL and TESTOMNIAC_API_KEY environment variables, or use the set_api_key tool."
    );
  }
  if (!client) {
    client = new ApiClient(apiUrl, apiKey);
  }
  return client;
}
