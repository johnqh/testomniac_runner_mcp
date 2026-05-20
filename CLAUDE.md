# Testomniac Runner MCP Server

MCP server that gives AI assistants direct browser control and test execution capabilities via Puppeteer and the testomniac_runner_service.

**Package**: `@sudobility/testomniac_runner_mcp` (BUSL-1.1)

## Tech Stack

- **Runtime**: Bun
- **Package Manager**: Bun
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Browser**: Puppeteer (bundles Chromium automatically)
- **Runner Service**: `@sudobility/testomniac_runner_service`
- **Validation**: Zod
- **Transport**: stdio

## Architecture

```
AI Assistant (Claude Code/Desktop)
    ↕ stdio (MCP protocol)
Testomniac Runner MCP Server (this project)
    ↕ Puppeteer (browser control)
Headless Chromium (page interaction)
    ↕ HTTP (for full scans)
Testomniac API (persistence, optional)
```

The MCP server manages a headless browser session and wraps the runner service library to provide page analysis, test generation, expertise evaluation, and full scan execution.

## Commands

```bash
bun run dev        # Run MCP server (stdio mode)
bun run build      # Bundle to dist/index.js
bun run typecheck  # TypeScript check
bun run start      # Run production bundle
```

## Project Structure

```
src/
├── index.ts             # Entry point: server setup, signal handlers, transport
├── browser-session.ts   # Puppeteer browser lifecycle + BrowserAdapter factory
└── tools/
    ├── browser.ts           # browser_launch, browser_navigate, browser_click, browser_type, browser_screenshot, browser_get_content, browser_evaluate, browser_get_logs, browser_close, browser_status
    ├── analysis.ts          # extract_actionable_items, extract_forms, detect_login_page, evaluate_page_health, build_dom_snapshot, detect_scaffolds, decompose_page
    ├── test-generation.ts   # generate_render_test, generate_interaction_test, generate_form_test, generate_navigation_test, generate_e2e_test
    ├── expertise.ts         # run_all_expertises, run_expertise
    └── scan.ts              # run_full_scan
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHROMIUM_PATH` | No | Override path to Chromium (default: uses bundled Chromium from puppeteer) |
| `TESTOMNIAC_API_URL` | For scans | Base URL of the Testomniac API |
| `TESTOMNIAC_API_KEY` | For scans | Scanner API key |

## Tools (25)

### Browser Control (10)
- `browser_launch` — Launch headless browser with optional viewport
- `browser_close` — Close browser and free resources
- `browser_status` — Check if browser is active and get current URL
- `browser_navigate` — Navigate to a URL
- `browser_click` — Click an element by CSS selector
- `browser_type` — Type text into an input field
- `browser_screenshot` — Take a screenshot (returns image)
- `browser_get_content` — Get current page HTML
- `browser_evaluate` — Execute JavaScript on the page
- `browser_get_logs` — Get console and network logs

### Page Analysis (7)
- `extract_actionable_items` — Extract buttons, links, inputs, forms, selects, toggles
- `extract_forms` — Analyze forms with fields and validation
- `detect_login_page` — Detect login pages and SSO buttons
- `evaluate_page_health` — Check for broken images, dead links, overlaps
- `build_dom_snapshot` — Structured DOM snapshot
- `detect_scaffolds` — Find headers, footers, sidebars, navigation
- `decompose_page` — Decompose into body + scaffolds + patterns

### Test Generation (5)
- `generate_render_test` — Page load/render test
- `generate_interaction_test` — Element interaction test
- `generate_form_test` — Form validation tests
- `generate_navigation_test` — Link destination test
- `generate_e2e_test` — Multi-step E2E flow test

### Expertise Evaluation (2)
- `run_all_expertises` — Run all 7 expertise modules (Tester, SEO, Security, Performance, Content, UI, Accessibility)
- `run_expertise` — Run a specific expertise module

### Full Scan (1)
- `run_full_scan` — Execute a complete Testomniac discovery scan (requires API)

## Usage with Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "testomniac-runner": {
      "command": "bun",
      "args": ["run", "/path/to/testomniac_runner_mcp/src/index.ts"],
      "env": {
        "TESTOMNIAC_API_URL": "http://localhost:8027",
        "TESTOMNIAC_API_KEY": "your-scanner-key"
      }
    }
  }
}
```

## Related Projects

- **testomniac_runner_service** — Shared test execution library this MCP wraps
- **testomniac_runner** — Server-side worker (polling-based, not MCP)
- **testomniac_api** — The API server for persistence
- **testomniac_api_mcp** — MCP for the API endpoints (companion to this project)
