---
name: test-app
description: Use when testing a web application, verifying UI changes, checking page health, running accessibility/SEO/security/performance audits, validating a web page, testing user flows, or stopping an active scan. Trigger on /test-app, "test this page", "check for bugs", "run a health check", "audit this URL", "verify my changes work", "test it as a [persona]", "do a complete scan", "quick scan", "stop the scan", "cancel scan", or after making frontend changes when the user wants to confirm they work.
---

# Test App

Test a web application using Testomniac.

## Three execution paths — know which one you are on

Tools in the `testomniac-runner` MCP do not all work the same way, and the
difference decides what needs an API key and what can be stopped.

| Path | Tools | Where the work happens | Needs API? |
|------|-------|------------------------|-----------|
| **In-process** | `browser_*`, all analysis, all expertise, all `generate_*`, `run_sequence` | The MCP's own browser | Only `run_sequence` |
| **One-shot runner** | `execute_run`, `execute_sequence` | Spawned runner process that exits when done | Yes |
| **Daemon** | `run_full_scan` | Spawned runner polling the API; the MCP polls for the result | Yes |

`run_full_scan` does **not** scan in-process. It:

1. Calls `POST /api/v1/scan` to create a pending discovery run
2. Auto-starts a `testomniac_runner` daemon (if not already running)
3. The runner claims the pending run and executes it
4. The MCP polls the API until the run reaches `completed`, `failed`, or `stopped`
5. `status_update` messages stream to the console while it waits

Persona and scenario detection happen **server-side** when the API closes the
run out — not in the runner, and not in this MCP.

## MCP Servers Used

- **testomniac-runner** — browser control, page analysis, expertise evaluation,
  test generation, and scan execution
  (`set_api_key`, `browser_launch`, `browser_navigate`, `browser_click`,
  `browser_type`, `browser_screenshot`, `browser_get_content`,
  `browser_evaluate`, `browser_get_logs`, `browser_status`, `browser_close`,
  `extract_actionable_items`, `extract_forms`, `detect_login_page`,
  `evaluate_page_health`, `build_dom_snapshot`, `detect_scaffolds`,
  `decompose_page`, `run_all_expertises`, `run_expertise`,
  `generate_render_test`, `generate_interaction_test`, `generate_form_test`,
  `generate_navigation_test`, `generate_e2e_test`, `run_full_scan`,
  `run_sequence`, `execute_run`, `execute_sequence`, `stop_scan`,
  `list_active_scans`)
- **testomniac-api** (optional) — query results and manage scenarios
  (`list_run_findings`, `get_run_findings_summary`, `get_finding_detail`,
  `get_finding_script`, `list_run_pages`, `get_run_summary`,
  `get_run_dashboard`, `list_entities`, `list_products`, `get_product`,
  `list_environments`, `list_personas`, `create_scenario`, `list_scenarios`,
  `generate_sequence`, `run_sequence`, `get_sequence_run`)

## Prerequisites

### 1. Target URL

If the user did not provide one:

1. Check the project's CLAUDE.md for a "Testing with Testomniac" section or a
   dev server URL.
2. Otherwise ask:
   > "What URL should I test? For example: `http://localhost:3000` or
   > `https://staging.yourapp.com`"

Do NOT proceed without a URL.

### 2. Dev server reachable (localhost URLs only)

```bash
curl -s -o /dev/null -w "%{http_code}" <url>
```

If it is not up, ask the user to start it first.

### 3. API key — for scan and scenario flows only

**Flow A needs no API key.** If the user has no key, or does not want to set
one up, Flow A still gives them a real page audit. Offer it rather than
blocking.

Flows B, C and D need a key. Attempt the call; if it fails with
"API not configured", prompt:

> "I need a Testomniac API key for that.
>
> **To get one:**
> 1. Go to [https://testomniac.com](https://testomniac.com)
> 2. Sign in or create an account
> 3. Open your organization settings and create an API key
>
> Then tell me the key, e.g. `Set the testomniac API key to tst_your_key_here`
>
> For a local API server, include the URL:
> `Set the testomniac API key to tst_... and API URL to http://localhost:8027`
>
> Or I can run a page check right now with no key at all."

`set_api_key` verifies the key against the API before saving it, and persists
it so it survives a restart.

## Route the request

| User says | Flow |
|-----------|------|
| "test this page", "check for bugs", "health check", "audit this URL", "any accessibility problems" | **Flow A: Page Check** (no API key) |
| "quick scan", "what pages does it have", "map the site" | **Flow B: Quick Scan** |
| "scan", "full scan", "scan my site", "complete scan" | **Flow C: Full Scan** |
| "test it as a shopper", "add to cart and check out", "test the login flow" | **Flow D: Scenario Test** |
| "stop", "cancel", "abort the scan" | **Stopping a Scan** |

If the request says "scan" in any form, use Flow B or C — do not substitute
Flow A, which only sees one page. If unclear, ask which they want rather than
guessing: Flow A takes seconds, Flow C can take many minutes.

---

## Flow A: Page Check (no API key)

One page, in the MCP's own browser. Fast, and the only flow that works
offline from the Testomniac API.

1. `browser_navigate` to the URL.
2. `browser_screenshot` — see what the user sees.
3. `evaluate_page_health` — broken images, dead links, overlapping elements,
   placeholder text, price and stock errors.
4. `extract_actionable_items` — what is interactive on the page.
5. `run_all_expertises` — SEO, security, performance, content, UI,
   accessibility.
6. `browser_get_logs` — console errors and failed requests. Logs accumulate
   from page creation, so navigate before reading them.

Then report, grouping by severity and using
[references/finding-fixes.md](references/finding-fixes.md) for concrete fixes:

> **Page Check: {URL}**
>
> **Issues ({N}):**
> - [{type}] {title}
>   - **Fix:** {concrete change}
>
> Want me to scan the whole site, or dig into one of these?

Always `browser_close` when done.

**Caveat to keep in mind:** `run_all_expertises` here builds a minimal context
from the live page — no expectations, no before/after snapshots, no control
states. Checks needing full test context are skipped, not failed. It is a page
audit, not a scan-equivalent result set.

---

## Flow B: Quick Scan

`scanMode: "minimum"` — discovers and captures pages without exercising
interactions. The fast way to learn the site's structure.

Call `run_full_scan` with `baseUrl` and `scanMode: "minimum"`. Status updates
stream to the console while it polls.

Useful extra arguments, all optional:

- `scanScopePath` — confine discovery to a subtree, e.g. `/docs`
- `sizeClass` — `"desktop"` (default) or `"mobile"`
- `expertiseSlugs` — e.g. `["accessibility", "seo"]` to narrow the checks
- `loginUrl` / `entityCredentialId` — to scan behind a login
- `reportEmail` — email the finished report
- `captureApi` — **off unless the user asks for it**; it sends request and
  response bodies to the graph service

Prefer the `run_full_scan` tool. The same flow also exists as a CLI in the
plugin directory (`bun run scan:status <baseUrl> --scan-mode minimum`), but it
needs that directory resolved first — `${CLAUDE_PLUGIN_ROOT}` when the variable
is set in the shell, otherwise the checkout path. Only reach for it if the tool
itself is unavailable.

Report:

> **Quick Scan Complete: {URL}**
>
> - Pages discovered: {pagesFound}
> - Page states: {pageStatesFound}
> - Duration: {totalDurationMs}ms
> - Status: {status}
>
> Want me to run a **full scan** with interaction testing, or test a specific
> **user flow**?

---

## Flow C: Full Scan

`scanMode: "full"` — discovers pages **and** exercises interactions: clicks,
hovers, form submissions, keyboard actions. Finds far more, takes far longer.

Call `run_full_scan` with `baseUrl` and `scanMode: "full"`, plus any of the
optional arguments listed in Flow B. `quickScan: true` is a shorthand that
makes the server pick `partial` mode — a middle setting that skips redundant
hover tests.

Report as in Flow B, plus `testRunsCompleted`, then offer the findings
drilldown below.

---

## Flow D: Scenario Test

Tests a named user journey. **Requires a prior scan** (Flow B or C) so the
system knows what pages and elements exist. If none has run:

> "I need to scan the site first to discover pages and elements. Want me to
> run a quick scan?"

### Step 1: Identify product, runner, and environment

1. `list_products` (testomniac-api) with the entity slug. If you do not know
   it, `list_entities` lists the user's workspaces — but note it needs a
   Firebase token, so under API-key auth just ask:
   > "What's your Testomniac organization name or entity slug?"
2. If several products, ask which.
3. `get_product` → the runner ID.
4. `list_environments` → the test environment ID.

### Step 2: Create the scenario

Build it from the user's words:

- **title** — short name, e.g. "Shopper adds item to cart"
- **startingPath** — where to begin, e.g. `/`
- **prompt** — the full description, e.g. "As a shopper, browse products, add
  an item to the cart, proceed to checkout, and complete the purchase"

If the request is vague, ask:
> "What user flow should I test? Describe what a user would do, step by step.
> For example: 'Go to the store, add an item to the cart, and check out'."

Call `create_scenario` with **`runnerId`**, title, startingPath, prompt, and
optionally `personaId` and `sizeClass`. The runner ID is required — scenarios
live under a runner, and the scenario ID alone is not enough to update or
delete one later.

### Step 3: Generate the sequence

`generate_sequence` with the scenario ID and the test environment ID. This is
an AI call on the server; it returns 503 if the API has no AI credentials and
404 if no pages have been discovered.

> **Scenario: {title}**
> Generated {N} test steps. Ready to run?

### Step 4: Run it

Two tools share the name `run_sequence`. You need both, in order:

1. **testomniac-api** `run_sequence` with the **sequence ID** — creates a
   pending sequence run and returns its ID.
2. **testomniac-runner** `run_sequence` with that **`sequenceRunId`** and the
   **`runnerId`** — executes the steps in the MCP's own browser.

The runner-side call leaves the browser on the final page, which is what makes
the next step possible.

### Step 5: Continue interactively

The generated sequence gets the flow started; it rarely finishes a real
journey. Loop, at most 10 times:

1. `browser_screenshot` — current state.
2. `extract_actionable_items` — what can be done next.
3. Decide: goal reached? stuck? more steps needed?
4. Act — `browser_click`, `browser_type`, `browser_navigate`.

Exit when the goal is reached, the state repeats twice, an error page appears,
or you hit the iteration cap. Say which of those ended it.

### Step 6: Report and clean up

> **Scenario Test: {title}**
>
> Status: {PASS/FAIL} — {passed} of {N} steps passed
>
> **What happened:**
> 1. {step by step}
>
> **Findings ({F}):**
> - [{type}] {title} — **Page:** {path} — **Fix:** {fix}

Always `browser_close`.

---

## Stopping a Scan

1. `list_active_scans` (testomniac-runner) for the scan IDs.
2. `stop_scan` with the `testRunId`.
3. Report:
   > "Scan stopped — the current interaction finished and the rest was
   > cancelled. Interactions completed: {N}."

The stop signal travels over the runner daemon's stdin, so it reaches **only**
scans that `run_full_scan` started in this session. It cannot stop an
`execute_run` one-shot, and it cannot stop a scan started before this MCP
server booted. If `list_active_scans` is empty, the scan already finished —
report its results instead.

Partial results are real results: a stopped run keeps everything it found
before the stop.

---

## Finding Detail Drilldown

On a scan with many findings, start with `get_run_findings_summary`
(testomniac-api) — it groups repeated instances of one rule into a single row,
which is usually what the user wants to read. Use `list_run_findings` for the
full list.

Then offer:

> "Want details on any finding? I can show reproduction steps and a Playwright
> script."

`get_finding_detail` returns the finding, the interaction that triggered it,
the full dependency chain, and a runnable Playwright script with the
prerequisite interactions replayed in order. `get_finding_script` returns just
the script.

> **Finding: {title}**
>
> **Description:** {description}
> **Severity:** {type}
> **Page:** {path}
>
> **Reproduction steps:**
> 1. {dependency interaction}
> 2. {the interaction that found it}
>
> **Playwright script:**
> ```typescript
> {playwrightScript}
> ```

## Re-verification

After fixes, offer to re-run the same flow: "Want me to re-run the scan to
verify the fixes?"

## Error Handling

| Error | Response |
|-------|----------|
| API not configured | Offer Flow A now, and prompt for a key for the rest (see prerequisites) |
| API key rejected | The key was refused by `/auth/test`. Check it is the right key for that API URL — an entity key from one server will not work against another. |
| Failed to create discovery run | Check the API URL and key, and that the API server is running. |
| Scan sits at "pending" and never starts | Nothing claimed the run. The runner daemon may have failed to launch, cannot reach the API, or is authenticating as a different entity than the one that owns the run. Check the console for `[testomniac:runner-daemon]` lines. |
| Browser fails to launch | Run `bun install` so Puppeteer downloads its browser, or set `CHROMIUM_PATH` to a Chrome/Chromium binary. |
| Scan timed out | Polling gives up after 10 minutes. The run may still be going — check its status rather than assuming it died. |
| No pages discovered | "The site hasn't been scanned yet. Want me to run a quick scan first?" |
| Entity slug unknown | "What's your Testomniac organization name? Find it at testomniac.com in your org settings." |
| No products found | "No products found. Run a scan first — it creates one automatically." |
| `generate_sequence` returns 503 | The API has no AI credentials configured. Scenario generation is unavailable; the scan flows still work. |
| No active scan to stop | "No scan is currently running. It may have already finished." |
| Scan status is "stopped" | Stopped gracefully. Report the partial results and offer to re-run. |
