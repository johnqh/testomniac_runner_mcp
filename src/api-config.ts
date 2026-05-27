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
