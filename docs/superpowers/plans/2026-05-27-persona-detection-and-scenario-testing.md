# Persona Detection & Scenario Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a discovery scan completes, automatically detect personas. Enable AI assistants to create test scenarios, generate test sequences, and run them — supporting flows like "test it as a shopper, add an item to the cart, and check out." The MCP bundles the runner as a child process for local execution.

**Architecture:** Five repos are touched. The API gets two new auto-enriching scanner endpoints. The runner service gets post-scan persona detection and sequence execution. The runner gets a one-shot mode for MCP-initiated execution. The API MCP gets 6 new tools. The runner MCP bundles the runner as a dependency, manages it as a child process, and rewrites the skill.

**Tech Stack:** Bun, Hono, MCP SDK, Zod v4, testomniac_runner_service, ShapeShyft AI

**Repos:**
- `testomniac_api` — `/Users/johnhuang/projects/testomniac_api`
- `testomniac_runner_service` — `/Users/johnhuang/projects/testomniac_runner_service`
- `testomniac_runner` — `/Users/johnhuang/projects/testomniac_runner`
- `testomniac_api_mcp` — `/Users/johnhuang/projects/testomniac_api_mcp`
- `testomniac_runner_mcp` — `/Users/johnhuang/projects/testomniac_runner_mcp`

---

## Phase 1: testomniac_api — Auto-enriching Scanner Endpoints

### Task 1: Add POST /scanner/personas/detect

**Files:** Modify `/Users/johnhuang/projects/testomniac_api/src/routes/scanner-ai.ts`

Takes `{ productId }`, auto-fetches pages/content from DB, calls ShapeShyft, upserts personas. Scanner key auth (no Firebase needed).

- [ ] Add endpoint after existing `/personas/generate` route (after line 189). Logic: find runner by productId → get pages → get latest page states with content → enrich with actionable items → call ShapeShyft `generate-personas` → upsert personas → return final list.
- [ ] Add `runners`, `pages`, `pageStates`, `actionableItems` imports from `"../db"` if missing.
- [ ] Verify endpoint mounts correctly via `scannerAiRouter` (already under `/scanner`).
- [ ] Test: `curl -X POST localhost:8027/api/v1/scanner/personas/detect -H "X-Scanner-Key: $KEY" -d '{"productId":1}'`
- [ ] Commit.

### Task 2: Add POST /scanner/test-scenarios/:id/generate-sequence

**Files:** Modify `/Users/johnhuang/projects/testomniac_api/src/routes/scanner-ai.ts`

Takes `{ testEnvironmentId }`, auto-fetches pages/content/navigation map, calls ShapeShyft, creates surface + interactions + sequence. Mirrors the Firebase-auth endpoint in `detail-read.ts`.

- [ ] Add endpoint after existing `/test-scenarios/:id/generate` route (after line 319). Logic: get scenario → get env pages → enrich with content + actionable items + navigation map → call ShapeShyft `generate-test-sequence` → create test surface + test interactions + test actions → create sequence + link interactions.
- [ ] Add `pageStates`, `actionableItems` imports if missing.
- [ ] Test: `curl -X POST localhost:8027/api/v1/scanner/test-scenarios/1/generate-sequence -H "X-Scanner-Key: $KEY" -d '{"testEnvironmentId":1}'`
- [ ] Commit.

---

## Phase 2: testomniac_runner_service — Persona Detection + Sequence Execution

### Task 3: Add detectPersonas method to ApiClient

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_service/src/api/client.ts`

- [ ] Add method near existing persona methods:
```typescript
async detectPersonas(
  productId: number
): Promise<Array<{ id: number; productId: number; title: string; description: string }>> {
  return this.request("POST", "/personas/detect", { productId });
}
```
- [ ] Commit.

### Task 4: Add sequence-related methods to ApiClient

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_service/src/api/client.ts`

- [ ] Add methods:
```typescript
async getTestScenarioSequence(
  id: number
): Promise<{ id: number; testScenarioId: number; testEnvironmentId: number } | null> {
  return this.request("GET", `/test-scenario-sequences/${id}`);
}

async getSequenceTestInteractions(
  sequenceId: number
): Promise<Array<{ id: number; testScenarioSequenceId: number; testInteractionId: number; stepOrder: number }>> {
  return this.request("GET", `/test-scenario-sequence-test-interactions?testScenarioSequenceId=${sequenceId}`);
}

async getSequenceRun(
  id: number
): Promise<{ id: number; testScenarioSequenceId: number; status: string } | null> {
  return this.request("GET", `/test-scenario-sequence-runs/${id}`);
}

async completeSequenceRun(
  id: number,
  payload: { status?: string }
): Promise<void> {
  return this.request("PUT", `/test-scenario-sequence-runs/${id}/complete`, payload);
}
```
- [ ] Commit.

### Task 5: Add productId to RunConfig, personas to ScanResult

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_service/src/orchestrator/types.ts`

- [ ] Add `productId?: number` to `RunConfig`.
- [ ] Add `personas?: Array<{ id: number; title: string; description: string }>` to `ScanResult`.
- [ ] Add `onPersonasDetected?(personas: Array<{ id: number; title: string; description: string }>): void` to `ScanEventHandler`.
- [ ] Commit.

### Task 6: Call persona detection after scan completes

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_service/src/orchestrator/runner.ts`

- [ ] After test run is claimed (~line 203), resolve productId:
```typescript
let productId = config.productId;
if (!productId) {
  const runner = await api.getRunner(config.runnerId);
  productId = runner?.productId;
}
```
- [ ] After `wrappedEvents.onTestRunCompleted(...)` and before `return result`, call persona detection:
```typescript
if (productId) {
  try {
    const detectedPersonas = await api.detectPersonas(productId);
    result.personas = detectedPersonas.map(p => ({ id: p.id, title: p.title, description: p.description }));
    wrappedEvents.onPersonasDetected?.(result.personas);
  } catch (err) {
    wrappedEvents.onError({ message: `Persona detection failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}
```
- [ ] Run `bun run typecheck && bun run test`.
- [ ] Commit.

### Task 7: Add runSequenceRun() function

**Files:** Create `/Users/johnhuang/projects/testomniac_runner_service/src/orchestrator/sequence-runner.ts`

This function executes an ordered list of test interactions for a sequence run. It reuses `executeTestInteraction()` for each step.

- [ ] Create the file:
```typescript
import pino from "pino";
import type { BrowserAdapter } from "../adapter";
import type { ApiClient } from "../api/client";
import type { Expertise } from "../expertise";
import { executeTestInteraction } from "./test-interaction-executor";
import type { ScanEventHandler } from "./types";

const logger = pino({ name: "sequence-runner" });

export interface SequenceRunConfig {
  sequenceRunId: number;
  runnerId: number;
  runnerInstanceId: string;
  runnerInstanceName: string;
  signal?: AbortSignal;
}

export interface SequenceRunResult {
  sequenceRunId: number;
  interactionsCompleted: number;
  interactionsFailed: number;
  durationMs: number;
}

export async function runSequenceRun(
  adapter: BrowserAdapter,
  config: SequenceRunConfig,
  api: ApiClient,
  expertises: Expertise[],
  events: ScanEventHandler
): Promise<SequenceRunResult> {
  const startTime = Date.now();
  let completed = 0;
  let failed = 0;

  // Get the sequence run and its ordered interactions
  const sequenceRun = await api.getSequenceRun(config.sequenceRunId);
  if (!sequenceRun) {
    throw new Error(`Sequence run ${config.sequenceRunId} not found`);
  }

  const links = await api.getSequenceTestInteractions(sequenceRun.testScenarioSequenceId);
  const orderedLinks = links.sort((a, b) => a.stepOrder - b.stepOrder);

  logger.info({
    sequenceRunId: config.sequenceRunId,
    interactionCount: orderedLinks.length,
  }, "starting sequence run");

  for (const link of orderedLinks) {
    if (config.signal?.aborted) break;

    const testInteraction = await api.getTestInteraction(link.testInteractionId);
    if (!testInteraction) {
      logger.warn({ testInteractionId: link.testInteractionId }, "test interaction not found, skipping");
      failed++;
      continue;
    }

    // Create a test interaction run for this step
    const testInteractionRun = await api.createTestInteractionRun({
      testInteractionId: link.testInteractionId,
      testSurfaceRunId: null as any, // Sequence runs don't have surface runs
      status: "running",
    });

    try {
      await executeTestInteraction(
        adapter,
        testInteractionRun,
        { id: config.sequenceRunId } as any, // minimal test run ref
        expertises,
        null, // no page analyzer for sequence runs
        api,
        events,
        undefined, // no discovery context
        undefined, // no scan scope path
        undefined, // no login manager
      );
      completed++;
      events.onTestInteractionRunCompleted?.({
        testInteractionRunId: testInteractionRun.id,
        passed: true,
      });
    } catch (err) {
      failed++;
      events.onTestInteractionRunCompleted?.({
        testInteractionRunId: testInteractionRun.id,
        passed: false,
      });
      events.onError?.({
        message: `Sequence step ${link.stepOrder} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      // Continue to next step — don't abort the whole sequence
    }
  }

  // Complete the sequence run
  const status = failed > 0 ? "failed" : "completed";
  await api.completeSequenceRun(config.sequenceRunId, { status });

  return {
    sequenceRunId: config.sequenceRunId,
    interactionsCompleted: completed,
    interactionsFailed: failed,
    durationMs: Date.now() - startTime,
  };
}
```

**Note:** The `executeTestInteraction` call signature may need adjustment based on actual parameter types. The implementer should check `test-interaction-executor.ts` for the exact interface and adapt the call. The key pattern is: iterate ordered interactions, execute each, track pass/fail, complete the sequence run.

- [ ] Export from `src/index.ts`:
```typescript
export { runSequenceRun, type SequenceRunConfig, type SequenceRunResult } from "./orchestrator/sequence-runner";
```
- [ ] Run `bun run typecheck`.
- [ ] Commit.

### Task 8: Build and publish runner_service

- [ ] Bump version in `package.json`.
- [ ] Run `bun run build`.
- [ ] Publish or link locally.
- [ ] Commit.

---

## Phase 3: testomniac_runner — One-Shot Mode

Currently the runner only polls for pending runs. Add a one-shot mode where it accepts a specific run ID via CLI args, executes it, and exits.

### Task 9: Add CLI arg parsing and one-shot execution

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner/src/index.ts`

- [ ] Add arg parsing and one-shot mode before the polling setup:
```typescript
import { parseArgs } from "util";
import { runFullScan } from "./orchestrator";
import { runSequenceScan } from "./orchestrator"; // new, Task 10

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "run-id": { type: "string" },
    "sequence-run-id": { type: "string" },
    "runner-id": { type: "string" },
    "base-url": { type: "string" },
    "size-class": { type: "string", default: "desktop" },
  },
  strict: false,
});

if (import.meta.main) {
  if (args["run-id"]) {
    // One-shot mode: execute a specific test run and exit
    const scanId = Number(args["run-id"]);
    const runnerId = Number(args["runner-id"]);
    const baseUrl = args["base-url"] ?? "";
    const sizeClass = args["size-class"] ?? "desktop";

    logger.info({ scanId, runnerId }, "one-shot mode: executing test run");
    try {
      await runFullScan({
        runnerId,
        scanId,
        scanUrl: baseUrl,
        baseUrl,
        sizeClass,
        runnerInstanceId: crypto.randomUUID(),
        runnerInstanceName: "mcp-runner",
      });
      logger.info({ scanId }, "one-shot run completed");
      process.exit(0);
    } catch (err) {
      logger.error({ err, scanId }, "one-shot run failed");
      process.exit(1);
    }
  } else if (args["sequence-run-id"]) {
    // One-shot mode: execute a specific sequence run and exit
    const sequenceRunId = Number(args["sequence-run-id"]);
    const runnerId = Number(args["runner-id"]);

    logger.info({ sequenceRunId, runnerId }, "one-shot mode: executing sequence run");
    try {
      await runSequenceScan({ sequenceRunId, runnerId });
      logger.info({ sequenceRunId }, "one-shot sequence run completed");
      process.exit(0);
    } catch (err) {
      logger.error({ err, sequenceRunId }, "one-shot sequence run failed");
      process.exit(1);
    }
  } else {
    // Default: polling mode
    setInterval(() => { void runnerManager.tick(); }, pollIntervalMs);
    void runnerManager.tick();
    logger.warn({ port, pollIntervalMs, maxConcurrentRunners }, "starting scanner service");
  }
}
```
- [ ] Commit.

### Task 10: Add runSequenceScan to orchestrator

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner/src/orchestrator.ts`

- [ ] Add sequence execution function (similar to `runFullScan` but calls `runSequenceRun`):
```typescript
import { runSequenceRun, type SequenceRunConfig } from "@sudobility/testomniac_runner_service";

export interface SequenceRunOptions {
  sequenceRunId: number;
  runnerId: number;
}

export async function runSequenceScan(options: SequenceRunOptions): Promise<void> {
  const config = loadConfig();
  const api = getApiClient(config.apiUrl + "/api/v1/scanner", config.scannerApiKey);

  const chromium = new ChromiumManager(config);
  await chromium.launch();

  try {
    const defaultScreen = DESKTOP_SCREENS[0];
    const page = await chromium.newPage(defaultScreen);
    const adapter = new PuppeteerAdapter(page);
    const expertises = createDefaultExpertises();

    const eventHandler: ScanEventHandler = {
      onPageFound: p => logger.info(p, "page found"),
      onPageStateCreated: s => logger.info(s, "page state created"),
      onTestSurfaceCreated: s => logger.info(s, "surface created"),
      onTestInteractionRunCompleted: r => logger.info(r, "interaction completed"),
      onTestRunCompleted: r => logger.info(r, "run completed"),
      onFindingCreated: f => logger.warn(f, "finding created"),
      onStatsUpdated: s => logger.debug(s, "stats"),
      onScreenshotCaptured: () => {},
      onScanComplete: s => logger.info(s, "complete"),
      onError: e => logger.error(e, "error"),
    };

    await runSequenceRun(
      adapter,
      {
        sequenceRunId: options.sequenceRunId,
        runnerId: options.runnerId,
        runnerInstanceId: crypto.randomUUID(),
        runnerInstanceName: "mcp-runner",
      },
      api,
      expertises,
      eventHandler
    );

    await page.close();
  } finally {
    await chromium.close();
  }
}
```
- [ ] Update `@sudobility/testomniac_runner_service` dependency to the version from Phase 2.
- [ ] Run `bun run typecheck`.
- [ ] Commit.

### Task 11: Build runner

- [ ] Run `bun run build`.
- [ ] Verify one-shot mode: `bun dist/index.js --run-id 1 --runner-id 1 --base-url http://localhost:3000`
- [ ] Commit.

---

## Phase 4: testomniac_api_mcp — New MCP Tools

### Task 12: Add persona tools

**Files:** Create `/Users/johnhuang/projects/testomniac_api_mcp/src/tools/personas.ts`

- [ ] Create file with `detect_personas` (POST `/api/v1/scanner/personas/detect`) and `list_personas` (GET `/api/v1/scanner/personas?productId=X`).
- [ ] Commit.

### Task 13: Add sequence tools

**Files:** Create `/Users/johnhuang/projects/testomniac_api_mcp/src/tools/sequences.ts`

- [ ] Create file with 4 tools:
  - `generate_sequence` — POST `/api/v1/scanner/test-scenarios/:id/generate-sequence`
  - `list_sequences` — GET `/api/v1/test-scenarios/:id/sequences`
  - `run_sequence` — POST `/api/v1/scanner/test-scenario-sequence-runs`
  - `get_sequence_run` — GET `/api/v1/scanner/test-scenario-sequence-runs/:id`
- [ ] Commit.

### Task 14: Register new tools

**Files:** Modify `/Users/johnhuang/projects/testomniac_api_mcp/src/index.ts`

- [ ] Import and register `registerPersonaTools` and `registerSequenceTools`.
- [ ] Run `bun run typecheck`.
- [ ] Commit.

---

## Phase 5: testomniac_runner_mcp — Bundle Runner + Process Management + Skill

### Task 15: Add testomniac_runner as dependency

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_mcp/package.json`

- [ ] Add dependency: `"testomniac_runner": "file:../testomniac_runner"` (or published package name if available).
- [ ] Run `bun install`.
- [ ] Commit.

### Task 16: Add runner process management

**Files:** Create `/Users/johnhuang/projects/testomniac_runner_mcp/src/runner-process.ts`

This module spawns the testomniac_runner as a child process in one-shot mode.

- [ ] Create file:
```typescript
import { spawn, type ChildProcess } from "child_process";
import { getApiConfig } from "./api-config.ts";

// Resolve the runner entry point from the dependency
function getRunnerPath(): string {
  // When installed as dependency, the runner source is in node_modules
  const candidates = [
    new URL("../node_modules/testomniac_runner/src/index.ts", import.meta.url).pathname,
    new URL("../node_modules/testomniac_runner/dist/index.js", import.meta.url).pathname,
  ];
  for (const p of candidates) {
    if (Bun.file(p).size) return p;
  }
  throw new Error("testomniac_runner not found. Run bun install.");
}

export interface RunnerProcessOptions {
  runId?: number;
  sequenceRunId?: number;
  runnerId: number;
  baseUrl?: string;
  sizeClass?: string;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export function spawnRunner(options: RunnerProcessOptions): {
  process: ChildProcess;
  done: Promise<{ exitCode: number | null }>;
} {
  const config = getApiConfig();
  if (!config.apiUrl || !config.apiKey) {
    throw new Error("API not configured. Use set_api_key first.");
  }

  const runnerPath = getRunnerPath();
  const args = ["run", runnerPath];

  if (options.runId) {
    args.push("--run-id", String(options.runId));
    args.push("--runner-id", String(options.runnerId));
    if (options.baseUrl) args.push("--base-url", options.baseUrl);
    if (options.sizeClass) args.push("--size-class", options.sizeClass);
  } else if (options.sequenceRunId) {
    args.push("--sequence-run-id", String(options.sequenceRunId));
    args.push("--runner-id", String(options.runnerId));
  }

  const child = spawn("bun", args, {
    env: {
      ...process.env,
      TESTOMNIAC_API_URL: config.apiUrl,
      SCANNER_API_KEY: config.apiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (options.onStdout && child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        options.onStdout!(line);
      }
    });
  }
  if (options.onStderr && child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) {
        options.onStderr!(line);
      }
    });
  }

  const done = new Promise<{ exitCode: number | null }>((resolve) => {
    child.on("close", (code) => resolve({ exitCode: code }));
  });

  return { process: child, done };
}
```
- [ ] Commit.

### Task 17: Add execute_run and execute_sequence tools

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_mcp/src/tools/scan.ts`

- [ ] Add `execute_run` tool that spawns the runner in one-shot mode for a test run:
```typescript
server.tool(
  "execute_run",
  "Execute a test run locally using the bundled runner. Spawns a runner process that executes the specific run and exits.",
  {
    runId: z.number().describe("Test run ID to execute"),
    runnerId: z.number().describe("Runner ID"),
    baseUrl: z.string().describe("Base URL of the site"),
    sizeClass: z.enum(["desktop", "mobile"]).optional(),
  },
  async ({ runId, runnerId, baseUrl, sizeClass }) => {
    const logs: string[] = [];
    const { done } = spawnRunner({
      runId, runnerId, baseUrl, sizeClass,
      onStdout: (line) => logs.push(line),
      onStderr: (line) => logs.push(`[err] ${line}`),
    });
    const { exitCode } = await done;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ exitCode, success: exitCode === 0, logs }, null, 2),
      }],
    };
  }
);
```
- [ ] Add `execute_sequence` tool similarly for sequence runs.
- [ ] Import `spawnRunner` from `../runner-process.ts`.
- [ ] Commit.

### Task 18: Update scan tool to surface personas

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_mcp/src/tools/scan.ts`

- [ ] Add `onPersonasDetected` to eventHandler in `run_full_scan`.
- [ ] Include personas in the result JSON.
- [ ] Run `bun run typecheck`.
- [ ] Commit.

### Task 19: Rewrite /test-app skill

**Files:** Modify `/Users/johnhuang/projects/testomniac_runner_mcp/skills/test-app/SKILL.md`

The skill was already updated earlier in this session with the three-flow structure (Quick Check, Scenario Test, Full Scan) including user prompting for missing API keys, URLs, entity slugs, etc.

Additional updates for this plan:
- [ ] Update Flow B Step 6 to use `execute_sequence` (local runner) instead of just `run_sequence` (API pending run).
- [ ] Update Flow C to use `execute_run` (local runner) as alternative to `start_scan`.
- [ ] Add guidance: "For local dev, use `execute_run`/`execute_sequence` (runs locally via bundled runner). For remote, use `start_scan`/`run_sequence` (queues for server-side runner)."
- [ ] Commit.

### Task 20: Update package.json, CLAUDE.md, README.md

- [ ] Update `CLAUDE.md` with new tools and runner process management.
- [ ] Update `README.md` with local runner execution docs.
- [ ] Run `bun run typecheck`.
- [ ] Commit.

---

## Dependency Graph

```
Phase 1 (testomniac_api)
  Task 1: POST /scanner/personas/detect
  Task 2: POST /scanner/test-scenarios/:id/generate-sequence
     ↓
Phase 2 (testomniac_runner_service)  ← depends on Phase 1
  Task 3: ApiClient.detectPersonas()
  Task 4: ApiClient sequence methods
  Task 5: RunConfig.productId, ScanResult.personas
  Task 6: Post-scan persona detection
  Task 7: runSequenceRun() function
  Task 8: Build & publish
     ↓
Phase 3 (testomniac_runner)  ← depends on Phase 2
  Task 9:  CLI arg parsing + one-shot mode
  Task 10: runSequenceScan() orchestrator
  Task 11: Build
     ↓                          ↓
Phase 4 (testomniac_api_mcp)    Phase 5 (testomniac_runner_mcp)
  ← depends on Phase 1           ← depends on Phases 2, 3, 4
  Task 12: Persona tools         Task 15: Add runner dependency
  Task 13: Sequence tools        Task 16: Runner process management
  Task 14: Register tools        Task 17: execute_run/execute_sequence tools
                                 Task 18: Personas in scan results
                                 Task 19: Skill rewrite
                                 Task 20: Docs
```

Phase 1 must go first. Phase 2 depends on 1. Phase 3 depends on 2. Phases 4 and 5 can run in parallel, but Phase 5 depends on Phase 3 (runner dependency).
