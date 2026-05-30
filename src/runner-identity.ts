import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";

const identityPath = resolve(import.meta.dir, "../.runner-instance.json");

interface RunnerIdentity {
  id: string;
  name: string;
}

function readIdentity(): RunnerIdentity | null {
  if (!existsSync(identityPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(identityPath, "utf-8")) as {
      id?: unknown;
      name?: unknown;
    };
    if (typeof parsed.id === "string" && typeof parsed.name === "string") {
      return { id: parsed.id, name: parsed.name };
    }
  } catch {
    // Regenerate invalid local identity files.
  }
  return null;
}

export function getRunnerIdentity(): RunnerIdentity {
  const existing = readIdentity();
  if (existing) return existing;

  const identity = {
    id: `mcp-${hostname()}-${crypto.randomUUID()}`,
    name: `Claude Code on ${hostname()}`,
  };
  writeFileSync(identityPath, JSON.stringify(identity, null, 2) + "\n");
  return identity;
}
