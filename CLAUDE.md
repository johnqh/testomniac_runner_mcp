# Testomniac Runner MCP Server

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or `scripts/push_all.sh` **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward, and
> finishing a task is not permission to commit it.

MCP server that gives AI assistants direct browser control and test execution capabilities via Puppeteer, the `testomniac_runner_service` library, and a spawned `testomniac_runner` process.

**Package**: `@sudobility/testomniac_runner_mcp` (BUSL-1.1)

Also ships the `test-app` skill and the `testomniac` Claude Code plugin — see **Plugin & Skill** below.

## Tech Stack

- **Runtime**: Bun
- **Package Manager**: Bun
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Browser**: Puppeteer (downloads its own Chrome for Testing)
- **Runner**: `@sudobility/testomniac_runner` (spawned as a child process)
- **Runner Service**: `@sudobility/testomniac_runner_service` (in-process library)
- **Validation**: Zod (imported as `zod/v4`)
- **Transport**: stdio

## Architecture

There are **three** execution paths, and confusing them is the main source of
wrong assumptions about this project.

```
                    AI Assistant (Claude Code/Desktop)
                                 ↕ stdio
                    Testomniac Runner MCP (this project)
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │ 1. in-process              │ 2. spawned runner          │ 3. daemon
    │    Puppeteer + library     │    one-shot child process  │    polling child
    ↓                            ↓                            ↓
 own browser                testomniac_runner            testomniac_runner
 (browser_*, analysis,      --run-id / --sequence-run-id  (polls the API for
  expertise, generation,    own browser, exits             pending runs)
  run_sequence)             (execute_run,                 (run_full_scan)
                             execute_sequence)
                                 ↕ HTTP                       ↕ HTTP
                          Testomniac API (persistence, port 8027)
```

1. **In-process** — `browser_*`, all analysis/expertise/generation tools, and
   `run_sequence` drive the MCP's own Puppeteer page through a `BrowserAdapter`
   and call `runner_service` functions directly. No child process, no polling.
2. **One-shot runner** — `execute_run` and `execute_sequence` spawn
   `testomniac_runner` with `--run-id` / `--sequence-run-id`, wait for it to
   exit, and return its stdout. The runner launches and tears down its own
   browser.
3. **Daemon** — `run_full_scan` creates the run over HTTP, starts (or reuses)
   a long-lived `testomniac_runner` in polling mode, and polls the API until
   the run reaches a terminal status. `stop_scan` reaches this process, and
   only this one.

## Commands

```bash
bun run dev          # Run MCP server (stdio mode)
bun run build        # Bundle to dist/index.js
bun run typecheck    # TypeScript check
bun run start        # Run production bundle
bun run scan:status <url> [--scan-mode minimum|partial|full] [--size-class desktop|mobile]
                     # Same flow as run_full_scan, but as a CLI that streams
                     # status to stdout. Stops the daemon on exit.
```

## Project Structure

```
src/
├── index.ts             # Entry point: server setup, signal handlers, transport
├── browser-session.ts   # Puppeteer lifecycle + the BrowserAdapter the library consumes
├── api-config.ts        # API URL/key state, .mcp.json persistence, createDiscoveryRun()
├── chromium.ts          # Resolves a Chromium path to hand the spawned runner
├── runner-identity.ts   # Stable runner instance id/name, cached in .runner-instance.json
├── runner-process.ts    # Spawns testomniac_runner one-shot (--run-id / --sequence-run-id)
├── runner-daemon.ts     # Spawns/stops the polling runner; stop_run IPC over stdin
├── scan-cli.ts          # `bun run scan:status` — run_full_scan as a CLI
└── tools/
    ├── config.ts            # set_api_key
    ├── browser.ts           # browser_launch/close/status/navigate/click/type/screenshot/get_content/evaluate/get_logs
    ├── analysis.ts          # extract_actionable_items, extract_forms, detect_login_page,
    │                        #   evaluate_page_health, build_dom_snapshot, detect_scaffolds, decompose_page
    ├── test-generation.ts   # generate_render/interaction/form/navigation/e2e_test
    ├── expertise.ts         # run_all_expertises, run_expertise
    └── scan.ts              # run_full_scan, run_sequence, execute_run, execute_sequence,
                             #   stop_scan, list_active_scans
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TESTOMNIAC_API_URL` | For scans | Base URL of the Testomniac API. Defaults to `https://api.testomniac.com`; overridable via `set_api_key` |
| `TESTOMNIAC_USER_API_KEY` | For scans | Entity API key (`tst_…`) or the API's global `SCANNER_API_KEY`. Overridable via `set_api_key` |
| `CHROMIUM_PATH` | No | Chromium for both the MCP's own browser and the spawned runner. Unset means Puppeteer's downloaded build is used for both |

Both values are also read from, and written back to, `.mcp.json` — that is how
`set_api_key` survives a restart.

### How the key reaches each layer

`firebaseAuthMiddleware` in the API accepts an entity key (`tst_`-prefixed),
the global scanner key, or a Firebase token. This project sends the key three
different ways, all of which that middleware accepts:

- `createDiscoveryRun` → `x-api-key`
- `run_full_scan` / `scan:status` polling → `X-Scanner-Key`
- spawned runner → `SCANNER_API_KEY` env var, which `runner_service`'s
  `ApiClient` turns into its own header

## Tools (31)

### Configuration (1)
- `set_api_key` — Set and persist the API key (and optionally URL). Verifies it against `/auth/test` before saving.

### Browser Control (10)
`browser_launch`, `browser_close`, `browser_status`, `browser_navigate`,
`browser_click`, `browser_type`, `browser_screenshot`, `browser_get_content`,
`browser_evaluate`, `browser_get_logs`

### Page Analysis (7)
`extract_actionable_items`, `extract_forms`, `detect_login_page`,
`evaluate_page_health`, `build_dom_snapshot`, `detect_scaffolds`,
`decompose_page`

### Test Generation (5)
`generate_render_test`, `generate_interaction_test`, `generate_form_test`,
`generate_navigation_test`, `generate_e2e_test`

### Expertise Evaluation (2)
- `run_all_expertises` — every module against the current page
- `run_expertise` — one of tester, seo, security, performance, content, ui, accessibility

Both build a *minimal* `ExpertiseContext` from the live page: no expectations,
no before/after UI snapshots, no control states. Checks that need full test
context are skipped rather than reported — treat the output as a page audit,
not as scan-equivalent findings.

### Execution (6)
- `run_full_scan` — create a discovery run, start the daemon, poll to completion
- `run_sequence` — execute a sequence in-process on the MCP's own browser, leaving it on the final page
- `execute_run` — one-shot spawned runner for a specific run
- `execute_sequence` — one-shot spawned runner for a specific sequence run
- `stop_scan` — graceful stop of a `run_full_scan` scan from this session
- `list_active_scans` — scans this session started and has not seen finish

## Plugin & Skill

This repo doubles as a Claude Code plugin. `.claude-plugin/marketplace.json`
declares a `testomniac` marketplace whose plugin source is `./`, so installing
it registers **this working copy** as the install location — edits to
`skills/test-app/SKILL.md` take effect with no reinstall step.

```
.claude-plugin/plugin.json       # name: "testomniac"
.claude-plugin/marketplace.json  # source: "./"
.mcp.json                        # the testomniac-runner MCP server definition
skills/test-app/SKILL.md         # the /test-app skill
skills/test-app/references/finding-fixes.md
```

Keep the skill honest about which of the three execution paths a flow uses; it
is the most common thing to get out of date here.

## Gotchas

- **`run_full_scan` does not scan.** It creates the run over HTTP and waits.
  The work happens in a separate `testomniac_runner` process. A scan can sit
  at "pending" forever if that process cannot start, cannot reach the API, or
  authenticates as an entity that does not own the run — `GET /test-runs/pending`
  filters by the entity the key resolves to.

- **Persona and scenario detection are the API's job, not the runner's.**
  They run inside `POST /api/v1/scan/end`. Nothing in this project detects
  them, so do not describe `run_full_scan` as doing it.

- **`stop_scan` only reaches the daemon.** The signal is a `{"type":"stop_run"}`
  line on the daemon's stdin, and the runner only installs that IPC listener in
  polling mode. A one-shot `execute_run` has no listener and cannot be stopped;
  neither can a scan started before this server booted, because `activeScans`
  lives in memory.

- **The spawned runner uses `puppeteer-core`, which bundles no browser.** Its
  own default is `/usr/bin/chromium`, which does not exist on macOS. `chromium.ts`
  passes Puppeteer's downloaded build as `CHROMIUM_PATH` when the variable is
  not already set — without that, every spawned run failed at browser launch.

- **API paths here are hand-rolled and drift silently.** `api-config.ts`,
  `tools/scan.ts` and `scan-cli.ts` build URLs with `fetch` rather than going
  through `runner_service`'s `ApiClient`, so an API route rename does not show
  up as a type error. When the API moves, grep for `api/v1` in `src/`.

- **`import { z } from "zod/v4"`** — not `"zod"`.

- **`.mcp.json` is written at runtime and holds the API key.** `set_api_key`
  persists into it. Treat it as a secret file; do not commit a real key.

- **`browser_evaluate` runs arbitrary JavaScript in the page.** It is as
  privileged as the page it runs on.

## Related Projects

- **testomniac_runner** (`@sudobility/testomniac_runner`) — the worker this MCP spawns. Its CLI contract (`--run-id`, `--sequence-run-id`, `--runner-id`, `--base-url`, `--size-class`, `--scan-mode`) and its stdin `stop_run` IPC are what `runner-process.ts` and `runner-daemon.ts` target.
- **testomniac_runner_service** (`@sudobility/testomniac_runner_service`) — shared execution library called in-process for the browser/analysis/sequence tools.
- **testomniac_types** — shared type definitions.
- **testomniac_api** — persistence; the runner and this MCP both talk to it.
- **testomniac_api_mcp** — companion MCP that queries the API. This one drives a browser; that one reads the data the scans produce.

## Git Workflow

- Do not use feature branches for code changes. Always stay on the current branch.
