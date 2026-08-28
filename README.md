# Testomniac Runner MCP

MCP server that gives AI assistants direct browser control and test execution capabilities via Puppeteer and the testomniac_runner_service.

**Package**: `@sudobility/testomniac_runner_mcp` (BUSL-1.1)

## What It Does

When connected to an AI assistant (Claude Code, Claude Desktop, etc.), this MCP server provides 31 tools for:

- **Browser automation** — launch, navigate, click, type, screenshot, evaluate JS
- **Page analysis** — extract interactive elements, forms, scaffolds, DOM snapshots, page health checks
- **Test generation** — create render, interaction, form, navigation, and E2E test definitions
- **Expertise evaluation** — run SEO, security, accessibility, performance, content, UI, and tester audits
- **Scan execution** — create a discovery run, drive a local runner process, follow it to completion, stop it

It also ships with a `/test-app` skill that orchestrates these tools into a guided testing workflow.

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- Puppeteer downloads a bundled Chromium automatically on `bun install`

## Installation

```bash
git clone <repo-url> testomniac_runner_mcp
cd testomniac_runner_mcp
bun install
```

Verify the setup:

```bash
bun run typecheck
```

## Setup with Claude Code

There are two ways to connect this MCP server to Claude Code:

### Option A: Install as a Claude Code Plugin (recommended)

This makes the MCP tools **and** the `/test-app` skill available in any project.

```bash
claude plugin add /path/to/testomniac_runner_mcp
```

The plugin is defined by:
- `.claude-plugin/plugin.json` — plugin metadata
- `.mcp.json` — MCP server declaration
- `skills/test-app/` — the `/test-app` slash command

### Option B: Add as an MCP Server Manually

Add to your Claude Code settings (`~/.claude/settings.json` for global, or `.claude/settings.json` in a specific project):

```json
{
  "mcpServers": {
    "testomniac-runner": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/testomniac_runner_mcp/src/index.ts"],
      "env": {
        "TESTOMNIAC_API_URL": "http://localhost:8027",
        "TESTOMNIAC_USER_API_KEY": ""
      }
    }
  }
}
```

> **Note:** Option B gives you the MCP tools but not the `/test-app` skill.

### Setup with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "testomniac-runner": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/testomniac_runner_mcp/src/index.ts"],
      "env": {
        "TESTOMNIAC_API_URL": "http://localhost:8027",
        "TESTOMNIAC_USER_API_KEY": ""
      }
    }
  }
}
```

## API Key Configuration

The MCP server needs an API key to communicate with the Testomniac API (required for full scans, optional for browser-only tools like screenshots and health checks).

There are two types of API keys:

| Key Type | When to Use | How to Set |
|----------|-------------|------------|
| **Master key** | Server deployments where the runner and API share a secret | Set `TESTOMNIAC_USER_API_KEY` environment variable |
| **Entity key** | Local development with a user-specific key (`tst_...`) | Use the `set_api_key` tool at runtime |

### Setting the key via environment variable

Set `TESTOMNIAC_USER_API_KEY` in the `env` block of your MCP server config (see setup sections above). This is the default — if set, it's used automatically.

### Setting the key at runtime

If you don't want to store the key in config files, or you're using an entity API key for local development, tell Claude:

> "Set the testomniac API key to tst_abc123..."

Claude will call the `set_api_key` tool. The key is verified against the API's `/auth/test` endpoint before it is accepted, then written back into `.mcp.json`, so it survives a restart. Treat that file as a secret.

You can also override the API URL at the same time:

> "Set the testomniac API key to tst_abc123 and the API URL to https://api.testomniac.com"

### Getting an entity API key

Entity API keys are created in the Testomniac web app under your organization's settings, or via the API:

```
POST /api/v1/entities/:entitySlug/api-keys
Body: { "title": "My local dev key" }
```

The full key is only shown once at creation time.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TESTOMNIAC_API_URL` | For scans | Base URL of the Testomniac API (e.g. `http://localhost:8027`) |
| `TESTOMNIAC_USER_API_KEY` | For scans | Master key or entity key. Overridable at runtime via `set_api_key` |
| `CHROMIUM_PATH` | No | Chromium for both the MCP's own browser and the runner it spawns. Unset means Puppeteer's downloaded build is used for both |

## Usage

### Quick health check (no API key needed)

Ask Claude:

> "Test the page at http://localhost:3000"

Or use the skill directly:

> "/test-app http://localhost:3000"

This launches a browser, navigates to the URL, takes a screenshot, checks for broken images, dead links, overlapping elements, console errors, and more.

### Deeper analysis

After the quick check, ask:

> "Run a full expertise analysis"

This runs all 7 expertise modules: Tester, SEO, Security, Performance, Content, UI, and Accessibility.

### Specific tools

You can also ask Claude to use individual tools:

> "Launch a browser and navigate to https://example.com"

> "Take a screenshot of the current page"

> "Extract all forms on this page"

> "Check if this is a login page"

> "Run the SEO expertise on this page"

> "Generate a render test for this page"

### Scenario testing (requires API + discovery scan)

After a full scan discovers pages, you can test specific user flows:

> "Test it as a shopper, add an item to the cart, and check out"

This creates a test scenario, uses AI to generate test steps from the
discovered pages, and runs the sequence locally. Results include pass/fail
status and any findings.

### Full site scan (requires API)

For multi-page crawling and comprehensive testing:

> "Run a full scan on https://example.com"

This requires the Testomniac API to be running and an API key to be configured.

`run_full_scan` does not do the scanning itself. It creates a pending run over HTTP, starts a `testomniac_runner` child process in polling mode, and polls the API until the run finishes. Persona and scenario detection happen server-side when the API closes the run out.

### Local runner execution

This project bundles `testomniac_runner` as a dependency. When you use `execute_run` or `execute_sequence`, it spawns the runner as a child process in one-shot mode — no separate server-side runner needed for local development.

## Tools Reference (31)

### Configuration (1)

| Tool | Description |
|------|-------------|
| `set_api_key` | Set API key and optionally API URL at runtime |

### Browser Control (10)

| Tool | Description |
|------|-------------|
| `browser_launch` | Launch headless browser with optional viewport size |
| `browser_close` | Close browser and free resources |
| `browser_status` | Check if browser is active and get current URL |
| `browser_navigate` | Navigate to a URL with configurable wait condition |
| `browser_click` | Click an element by CSS selector |
| `browser_type` | Type text into an input field (with optional clear) |
| `browser_screenshot` | Take a PNG screenshot (full page or viewport), returned as an image |
| `browser_get_content` | Get the current page's HTML |
| `browser_evaluate` | Execute JavaScript in the page context |
| `browser_get_logs` | Get accumulated console and network logs |

### Page Analysis (7)

| Tool | Description |
|------|-------------|
| `extract_actionable_items` | Extract buttons, links, inputs, forms, selects, toggles |
| `extract_forms` | Analyze forms with their fields and validation attributes |
| `detect_login_page` | Detect login pages, password fields, and SSO buttons |
| `evaluate_page_health` | Check for broken images, dead links, overlaps, price errors, placeholder text, and 20+ other issues |
| `build_dom_snapshot` | Structured DOM snapshot with selectors, roles, bounding boxes, landmarks |
| `detect_scaffolds` | Find headers, footers, sidebars, navigation, cookie banners, chat widgets |
| `decompose_page` | Decompose page into content body, scaffold regions, and UI patterns |

### Test Generation (5)

| Tool | Description |
|------|-------------|
| `generate_render_test` | Page load/render test definition |
| `generate_interaction_test` | Click/hover interaction test definition |
| `generate_form_test` | Form submission test with fills and discrete controls |
| `generate_navigation_test` | Link destination verification test |
| `generate_e2e_test` | Multi-step end-to-end flow test |

### Expertise Evaluation (2)

| Tool | Description |
|------|-------------|
| `run_all_expertises` | Run all 7 expertise modules (Tester, SEO, Security, Performance, Content, UI, Accessibility) |
| `run_expertise` | Run a single expertise module by name |

### Execution (6)

| Tool | Description |
|------|-------------|
| `run_full_scan` | Create a discovery run, start the runner daemon, poll until it finishes. Accepts the full option set the API persists: `scanMode`, `quickScan`, `scanScopePath`, `expertiseSlugs`, `loginUrl`, `entityCredentialId`, `reportEmail`, `captureApi` |
| `run_sequence` | Execute a sequence in-process on the MCP's own browser, leaving it on the final page for follow-up interaction |
| `execute_run` | Execute a specific test run via a one-shot spawned runner process |
| `execute_sequence` | Execute a specific sequence run via a one-shot spawned runner process |
| `stop_scan` | Gracefully stop a `run_full_scan` scan started in this session |
| `list_active_scans` | List scans this session started and has not seen finish |

Note the three different execution paths: `run_sequence` and every browser,
analysis, and expertise tool run **in-process**; `execute_run` and
`execute_sequence` **spawn a one-shot runner**; `run_full_scan` **starts a
polling daemon**. Only the daemon can be reached by `stop_scan`.

## The `/test-app` Skill

When installed as a plugin, the `/test-app` skill routes a request into one of
four flows:

1. **Page Check** (no API key needed) — browser + `evaluate_page_health`, `extract_actionable_items`, and the expertise modules against the page in front of you. Fast, local, and the only flow that works with no API.

2. **Quick Scan** (`scanMode: minimum`) — discovers and captures pages without running interaction tests.

3. **Full Scan** (`scanMode: full`) — discovers pages *and* exercises interactions: clicks, hovers, forms, keyboard.

4. **Scenario Test** — creates a scenario from the user's words, has the API generate a sequence from previously discovered pages, runs it, then continues interactively from the final page.

Plus **Stop**, which halts a running scan started in the same session.

Usage:

```
/test-app https://example.com
```

Or just describe what you want:

> "Test this page for accessibility issues"
> "Check if my site has any SEO problems"
> "Run a health check on localhost:3000"

## Development

```bash
bun run dev        # Run MCP server (stdio mode)
bun run build      # Bundle to dist/index.js
bun run typecheck  # TypeScript type checking
bun run start      # Run production bundle
```

### Project Structure

```
src/
├── index.ts             # Entry point: server setup, signal handlers, transport
├── browser-session.ts   # Puppeteer browser lifecycle + persistent BrowserAdapter
├── api-config.ts        # API URL/key state, .mcp.json persistence, createDiscoveryRun()
├── chromium.ts          # Resolves a Chromium path to hand the spawned runner
├── runner-identity.ts   # Stable runner instance id/name (.runner-instance.json)
├── runner-process.ts    # Spawns testomniac_runner one-shot
├── runner-daemon.ts     # Spawns/stops the polling runner; stop_run IPC over stdin
├── scan-cli.ts          # `bun run scan:status` — run_full_scan as a CLI
└── tools/
    ├── config.ts            # set_api_key
    ├── browser.ts           # 10 browser control tools
    ├── analysis.ts          # 7 page analysis tools
    ├── test-generation.ts   # 5 test generation tools
    ├── expertise.ts         # 2 expertise evaluation tools
    └── scan.ts              # 6 execution tools

skills/
└── test-app/
    ├── SKILL.md                    # /test-app skill definition
    └── references/
        └── finding-fixes.md       # Common findings → code fixes reference
```

### Architecture

```
AI Assistant (Claude Code / Claude Desktop)
    ↕ stdio (MCP protocol)
Testomniac Runner MCP Server (this project)
    ├── in-process: Puppeteer → Chromium, + testomniac_runner_service
    │                (browser_*, analysis, expertise, generation, run_sequence)
    ├── one-shot:   spawn testomniac_runner --run-id / --sequence-run-id
    │                (execute_run, execute_sequence)
    └── daemon:     spawn testomniac_runner in polling mode
                     (run_full_scan; stop_scan signals it over stdin)
            ↕ HTTP
        Testomniac API (persistence, port 8027)
```

The MCP server is a thin orchestration layer. Browser tools talk directly to Puppeteer; analysis, test generation, expertise evaluation, and sequence execution come from `@sudobility/testomniac_runner_service`; full scans are delegated to a spawned `@sudobility/testomniac_runner` process that does its own browser work.

## Related Projects

| Project | Description |
|---------|-------------|
| `testomniac_runner_service` | Shared execution library this MCP wraps |
| `testomniac_types` | Shared TypeScript type definitions |
| `testomniac_runner` | The polling worker this MCP spawns as a child process, and the same binary that runs server-side |
| `testomniac_api` | API server for persistence and entity management |
| `testomniac_api_mcp` | MCP for API endpoints (companion — this MCP controls the browser, api_mcp queries the API) |

## Troubleshooting

### Browser fails to launch

Puppeteer downloads Chrome for Testing automatically. If it fails:
- Run `bun install` to ensure the browser was downloaded
- Set `CHROMIUM_PATH` to point to a manually installed Chromium/Chrome binary

The spawned runner uses `puppeteer-core`, which bundles nothing and defaults to
`/usr/bin/chromium`. This MCP hands it Puppeteer's downloaded build via
`CHROMIUM_PATH` when the variable is not already set, so scans work on macOS
without extra configuration.
- On Linux, you may need system dependencies: `apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1`

### MCP tools not appearing in Claude Code

- Verify the plugin is installed: `claude plugin list`
- Or check that your `settings.json` has the `testomniac-runner` MCP server entry
- Check the MCP server starts without errors: `bun run src/index.ts` (should hang waiting for stdin — that's correct)

### "API not configured" error

This means no API key is set. Either:
1. Set `TESTOMNIAC_USER_API_KEY` in the MCP server's env config
2. Call the `set_api_key` tool at runtime

Browser-only tools (launch, navigate, screenshot, health check, expertise, test generation) work without an API key. The execution tools — `run_full_scan`, `run_sequence`, `execute_run`, `execute_sequence` — all need one.

### Empty logs from `browser_get_logs`

Logs accumulate from the moment the browser page is created. If you launch a browser and immediately check logs, they'll be empty. Navigate to a page first — console output and network requests will then appear in the logs.

### Page health check finds no issues but the page looks broken

`evaluate_page_health` runs browser-side checks (broken images, overlapping elements, etc.) but can't detect all visual issues. Use `browser_screenshot` to see the page, and `run_all_expertises` for deeper analysis including content, SEO, and accessibility checks.
