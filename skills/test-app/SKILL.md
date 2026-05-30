---
name: test-app
description: Use when testing a web application, verifying UI changes, checking page health, running accessibility/SEO/security/performance audits, validating a web page, or testing user flows. Trigger on /test-app, "test this page", "check for bugs", "run a health check", "audit this URL", "verify my changes work", "test it as a [persona]", "do a complete scan", "quick scan", or after making frontend changes when the user wants to confirm they work.
---

# Test App

Test a web application using Testomniac. The MCP creates scans via
the Testomniac API, and a separate runner process picks them up,
launches a browser, crawls pages, runs expertises, and persists
findings. The MCP polls for completion and returns results.

## Architecture

`run_full_scan` does NOT run scans in-process. It:
1. Calls POST /api/v1/scan to create a pending discovery run
2. Auto-starts a testomniac_runner daemon process (if not already running)
3. The runner picks up the pending run and executes it
4. The MCP polls the API until the run completes
5. Human-readable `status_update` messages are logged to console during polling

## MCP Servers Used

- **testomniac-runner** — Scan creation and polling, sequence execution
  (run_full_scan, run_sequence, set_api_key, browser_launch,
  browser_navigate, browser_click, browser_type, browser_screenshot,
  browser_close, browser_status)
- **testomniac-api** (optional) — Query scan results, manage scenarios
  (list_run_findings, get_finding_detail, list_run_pages,
  get_run_summary, create_scenario, generate_sequence, list_products,
  get_product, list_environments, list_personas)

## Prerequisites: Check Before Doing Anything

Before starting ANY flow, check these prerequisites in order. Stop
at the first missing item and prompt the user.

### 1. Check for Target URL

If the user did not provide a URL:

1. Check the project's CLAUDE.md for a "Testing with Testomniac"
   section or a dev server URL.
2. If not found, ask:
   > "What URL should I test? For example: `http://localhost:3000`
   > or `https://staging.yourapp.com`"

Do NOT proceed without a URL.

### 2. Check API Key (required for all flows)

All scan and scenario flows require a Testomniac API key. A local
developer runner can use an entity API key (`tst_...`) for both scan
creation and scanner endpoints. A server-side runner can use the global
scanner API key.

Attempt the scan — if it fails with "API not configured", prompt:

> "I need a Testomniac API key to run scans.
>
> **To get an API key:**
> 1. Go to [https://testomniac.com](https://testomniac.com)
> 2. Sign in or create an account
> 3. Go to your organization settings and create an API key
>
> Then tell me the key and I'll set it up. For example:
> `Set the testomniac API key to tst_your_key_here`
>
> If you also need to point to a different API server, include the URL:
> `Set the testomniac API key to tst_... and API URL to https://api.testomniac.com`"

Wait for the user to provide the key. Once provided, call `set_api_key`
to configure it, then continue. For local development, set the local API
URL too, for example:
`Set the testomniac API key to tst_... and API URL to http://localhost:8027`

### 3. Verify Dev Server is Running (for localhost URLs)

If the URL starts with `http://localhost` or `http://127.0.0.1`:

```bash
curl -s -o /dev/null -w "%{http_code}" <url>
```

If not running, ask the user to start it first.

## Determine What the User Wants

Match the user's request to one of three flows:

| User says | Flow |
|-----------|------|
| "quick scan", "test this page", "check for bugs", "health check" | **Flow A: Quick Scan** (minimum mode) |
| "scan", "full scan", "scan my site", "complete scan" | **Flow B: Full Scan** (full mode) |
| "test it as a shopper", "add to cart and check out", "test the login flow" | **Flow C: Scenario Test** |

If the request includes "scan" in any form, use Flow A or B — never
skip the runner. If unclear, default to Flow A (quick scan).

---

## Flow A: Quick Scan (minimum mode)

Navigates all public pages and captures content without running
interaction tests. Fast way to discover the site structure and get
baseline findings.

### Step 1: Run the Scan

Tell the user the scan is starting, then run this Bash command so
status updates are visible in Claude Code's console:

```bash
cd /Users/johnhuang/projects/testomniac_runner_mcp
bun run scan:status <baseUrl> --scan-mode minimum
```

This will:
- Create a discovery run via the API
- A separate runner process picks it up automatically
- The CLI polls until the run completes and prints `status_update` messages to stdout
- Return results with page count and run status

**Important:** The tool blocks while polling. If the scan times out
or the runner is not running, it returns an error.

### Step 2: Report Results

Parse the `run_full_scan` response and report:

> **Quick Scan Complete: {URL}**
>
> - Pages discovered: {pagesFound}
> - Interactions completed: {testRunsCompleted}
> - Duration: {totalDurationMs}ms
> - Status: {status}
> - Last status: {status_update}
>
> Want me to:
> - Run a **full scan** with interaction testing?
> - Test a specific **user flow** (e.g., "test it as a shopper")?

---

## Flow B: Full Scan (full mode)

Comprehensive scan that navigates pages AND tests all interactions
(clicks, hovers, form submissions, keyboard actions). Finds more
bugs but takes longer.

### Step 1: Run the Scan

Tell the user the scan is starting, then run this Bash command so
status updates are visible in Claude Code's console:

```bash
cd /Users/johnhuang/projects/testomniac_runner_mcp
bun run scan:status <baseUrl> --scan-mode full
```

This creates a discovery run and polls until the runner completes it.
Detailed `status_update` messages are emitted while the runner navigates,
runs interactions, records results, and detects personas.

### Step 2: Report Results

Parse the response and report:

> **Full Scan Complete: {URL}**
>
> - Pages discovered: {pagesFound}
> - Interactions completed: {testRunsCompleted}
> - Duration: {totalDurationMs}ms
> - Status: {status}
> - Last status: {status_update}

---

## Flow C: Scenario Test

Tests a specific user journey (e.g., "go to the store, add an item
to the cart, check out"). Requires a prior scan so the system knows
what pages and elements exist.

**Prerequisite:** A scan (Flow A or B) must have been run first.
If not, tell the user:
> "I need to scan the site first to discover pages and elements.
> Want me to run a quick scan first?"

### Step 1: Identify Product, Runner, and Environment

1. Call `list_products` (testomniac-api) with the user's entity slug.
   - If entity slug unknown, ask:
     > "What's your Testomniac organization name or entity slug?"
   - If no products, offer to run a scan first.
2. If multiple products, ask the user to pick one.
3. Call `get_product` to get product details and runner ID.
4. Call `list_environments` to get the test environment ID.
   - If no environments, a scan needs to run first.

### Step 2: Create Scenario and Generate Sequence

1. Build the scenario from the user's request:
   - **title**: Short name (e.g., "Shopper adds item to cart")
   - **startingPath**: URL path to start from (e.g., "/")
   - **prompt**: Full description of what to test, derived from the
     user's words (e.g., "As a shopper, browse products, add an item
     to the cart, proceed to checkout, and complete the purchase")

   If the user's request is vague, ask:
   > "What user flow should I test? Describe what a user would do,
   > step by step. For example:
   > - 'Go to the store, add an item to the cart, and check out'
   > - 'Search for a product and apply filters'
   > - 'Log in with invalid credentials and verify the error'"

2. Call `create_scenario` with the runner ID, title, startingPath,
   and prompt.

3. Call `generate_sequence` with the scenario ID and environment ID.

4. Report what was generated:
   > **Scenario: {title}**
   > Generated {N} test steps. Ready to run?

### Step 3: Create and Run the Sequence Run

Call `run_sequence` on **testomniac-api** with the generated sequence ID.
This creates a pending sequence run and returns its run ID.

Then call `run_sequence` on **testomniac-runner** with:
- `sequenceRunId`: the sequence run ID returned by testomniac-api
- `runnerId`: the runner ID

This executes all steps through the runner with expertise evaluation
and finding persistence.

### Step 4: Self-Healing Loop

After `run_sequence` completes, check if the flow goal was reached.
The browser remains on the final page.

**Loop (max 10 iterations):**

1. Call `browser_screenshot` to see the current state.
2. Call `extract_actionable_items` to see available interactions.
3. Evaluate: Is the goal reached? Stuck? More steps needed?
4. If more steps needed, execute the next logical action:
   - `browser_click` for buttons/links
   - `browser_type` for form fields
   - `browser_navigate` if needed
5. Go back to step 1.

**Exit when:** goal reached, stuck (same state twice), error page,
or max iterations.

### Step 5: Report Results

> **Scenario Test Complete: {title}**
>
> Status: {PASS/FAIL}
> Steps executed: {N} ({passed} passed, {failed} failed)
>
> **Flow summary:**
> 1. {what happened at each step}
>
> **Findings ({F}):**
> - [{type}] {title}
>   - **Page:** {path}
>   - **Fix:** {suggested fix}

### Step 6: Cleanup

Always call `browser_close` when done.

---

## Finding Detail Drilldown

After reporting findings, offer:

> "Want details on any finding? I can show reproduction steps and
> a Playwright script."

When asked about a specific finding:

1. Call `get_finding_detail` (testomniac-api) with the finding ID.
2. Report:

> **Finding: {title}**
>
> **Description:** {description}
> **Severity:** {type} (priority {priority})
> **Page:** {path}
>
> **Reproduction steps:**
> 1. {dependency interaction 1}
> 2. {the interaction that found the issue}
>
> **Playwright script:**
> ```typescript
> {playwrightScript}
> ```

## Re-verification

After fixing issues, offer to re-run:
> "Want me to re-run the scan to verify the fixes?"

## Error Handling

| Error | Response |
|-------|----------|
| API not configured | Prompt for API key (see prerequisites) |
| Scan timed out | "The scan timed out. The runner may have crashed. Check the console logs for errors." |
| Failed to create discovery run | Check the API URL and key are correct. The API server must be running. |
| Failed to poll test run | API may be down or the key may be invalid. |
| No pages discovered | "The site hasn't been scanned yet. Want me to run a quick scan first?" |
| Entity slug unknown | "What's your Testomniac organization name? Find it at testomniac.com in your org settings." |
| No products found | "No products found. Run a scan first — it will create one automatically." |
