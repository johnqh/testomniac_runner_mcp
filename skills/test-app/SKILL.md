---
name: test-app
description: Use when testing a web application, verifying UI changes, checking page health, running accessibility/SEO/security/performance audits, validating a web page, or testing user flows. Trigger on /test-app, "test this page", "check for bugs", "run a health check", "audit this URL", "verify my changes work", "test it as a [persona]", "do a complete scan", or after making frontend changes when the user wants to confirm they work.
---

# Test App

Test a web page or application using Testomniac's browser automation,
expertise evaluation, and scenario testing tools.

## MCP Servers Required

This skill uses tools from **two** MCP servers:

- **testomniac-runner** — Browser control, page analysis, expertises, execution
  (browser_launch, browser_navigate, browser_click, browser_type,
  browser_screenshot, evaluate_page_health, extract_actionable_items,
  extract_forms, detect_login_page, detect_scaffolds, decompose_page,
  run_all_expertises, run_expertise, run_full_scan, run_sequence, set_api_key)
- **testomniac-api** — Scans, scenarios, sequences, personas, finding details
  (start_scan, get_run_status, get_run_summary, list_run_findings,
  get_finding_detail, list_run_pages, create_scenario, list_scenarios,
  detect_personas, list_personas, generate_sequence, run_sequence,
  get_sequence_run, list_products, get_product, list_environments)

If the API MCP tools are not available, say so and offer browser-only
testing (Flow A only).

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

### 2. Check API Key (for Flows B and C)

Flows B (Scenario Test) and C (Full Scan) require the Testomniac API.
Before attempting any API tool call, check if the API is configured.

Try calling `list_products` or another lightweight API tool. If it
fails with an auth error or "API not configured":

> "I need a Testomniac API key to run scans and test scenarios.
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
to configure it, then continue.

### 3. Verify Dev Server is Running (for localhost URLs)

If the URL starts with `http://localhost` or `http://127.0.0.1`:

```bash
curl -s -o /dev/null -w "%{http_code}" <url>
```

If the server is not running (connection refused or non-200 status):

> "Your dev server at {URL} doesn't seem to be running. Please start
> it first and let me know when it's ready."

Wait for confirmation before proceeding.

## Determine What the User Wants

Match the user's request to one of three flows:

| User says | Flow |
|-----------|------|
| "test this page", "health check", "check for bugs", "audit this URL", "quick scan" | **Flow A: Quick Check** |
| "test it as a shopper", "add to cart and check out", "test the login flow" | **Flow B: Scenario Test** |
| "do a complete scan", "full scan", "scan my site" | **Flow C: Full Scan** |

If unclear, default to Flow A and offer the other flows afterward.

---

## Flow A: Quick Check (no API key needed)

### Step 1: Launch and Navigate

1. Call `browser_launch` with default viewport.
2. Call `browser_navigate` with the target URL.
3. Call `browser_screenshot` to capture the page.

### Step 2: Health Check

1. Call `evaluate_page_health` to check for broken images, dead links,
   overlapping elements, console errors, price errors, and more.
2. Call `extract_actionable_items` to inventory interactive elements.

**Report format:**

> **Quick Health Check: {URL}**
>
> Page loaded successfully. Found {N} interactive elements.
>
> **{M} issue(s) found:**
> - [severity] {title}: {description}
>   - **Fix:** {suggested fix}
>
> Want a deeper analysis? I can:
> - Run SEO, security, accessibility, and performance audits
> - Test a specific user flow (e.g., "test it as a shopper")
> - Do a complete site scan

If no issues, say so and offer the deeper options.

Always show the screenshot.

### Step 3: Targeted Analysis (on request)

Run when the user asks for deeper analysis or says "yes" to the offer.

1. Call `run_all_expertises` to evaluate SEO, Security, Performance,
   Content, UI, Accessibility, and Tester modules.
2. Call `detect_scaffolds` to identify page structure.
3. Call `extract_forms` if forms are present.
4. Call `detect_login_page` if the page looks like a login page.

Group findings by expertise. For each finding, explain why it matters
and suggest a concrete fix using the `finding-fixes.md` reference.

**Offer next steps:**
> "Want me to fix any of these issues? Or I can test a specific user
> flow or run a complete site scan."

### Step 3b: Cleanup

Always call `browser_close` when done, even if errors occurred.

---

## Flow B: Scenario Test (requires API key)

Use this when the user wants to test a specific user flow, e.g.:
- "Test it as a shopper, add an item to the cart, and check out"
- "Test the login flow with invalid credentials"
- "Test searching for a product and filtering results"

**Prerequisite:** This flow requires a prior discovery scan so the AI
knows what pages and elements exist on the site. If no pages are
discovered yet, tell the user and offer to run a scan first (Flow C).

### Step 4: Identify Product, Runner, and Environment

1. Call `list_products` with the user's entity slug.
   - **If the entity slug is unknown**, ask:
     > "What's your Testomniac organization name or entity slug?
     > You can find this at [https://testomniac.com](https://testomniac.com)
     > in your organization settings."
   - **If no products are returned**, tell the user:
     > "No products found for your organization. Please create a
     > product at [https://testomniac.com](https://testomniac.com)
     > first, or run a full scan which will create one automatically."
2. **If multiple products**, ask the user to pick one:
   > "I found these products:
   > 1. {product name} ({url})
   > 2. {product name} ({url})
   > Which one should I test?"
3. Call `get_product` to get product details and runner ID.
4. Call `list_environments` to get the test environment ID.
   - **If no environments exist**, tell the user:
     > "No test environments found. Please run a full scan first —
     > that will discover pages and set up the environment."

### Step 5: Create Scenario and Generate Sequence

1. Determine the scenario from the user's request:
   - **title**: Short name (e.g., "Shopper adds item to cart")
   - **startingPath**: URL path to start from (e.g., "/")
   - **prompt**: Full description of what to test, derived from the
     user's words (e.g., "As a shopper, browse products, add an item
     to the cart, proceed to checkout, and complete the purchase")

   **If the user's request is vague** (e.g., just "test it"), ask:
   > "What user flow should I test? For example:
   > - 'Test it as a shopper, add item to cart, and check out'
   > - 'Test the login flow with wrong credentials'
   > - 'Search for a product and apply filters'
   >
   > Describe what a user would do, step by step."

2. Call `create_scenario` with the runner ID, title, startingPath,
   and prompt.

3. Call `generate_sequence` with the scenario ID and environment ID.

   **If this fails with "No pages discovered":**
   > "The site hasn't been scanned yet — I need to discover pages
   > before I can generate test steps. Want me to run a full scan
   > first?"

   **If this fails with "AI features not configured":**
   > "AI-powered test generation is not configured on the API server.
   > Contact your Testomniac administrator to enable it."

4. Report what was generated:

> **Test Scenario Created: {title}**
>
> Generated {N} test steps:
> 1. {step description}
> 2. {step description}
> ...
>
> Ready to run this sequence?

### Step 6: Run the Sequence with Self-Healing

1. Call `browser_launch` if not already open.
2. Call `run_sequence` (testomniac-runner MCP) with the sequence run ID
   and runner ID. This executes the pre-defined steps in-process using
   the active browser session.
3. After `run_sequence` completes, check the result:
   - `allStepsPassed: true` means all pre-defined steps succeeded.
   - `interactionsFailed > 0` means some steps failed.
   - In **both cases**, the flow may not be complete — the sequence
     may not cover the full user journey.

### Step 7: Self-Healing Loop

After the sequence finishes (or partially fails), determine if the
**flow goal** has been reached. The goal is derived from the scenario
prompt (e.g., "complete the purchase" means we should see a
confirmation/thank-you page).

**Loop (max 10 iterations):**

1. Call `browser_screenshot` to see the current page state.
2. Call `extract_actionable_items` to see available interactions.
3. **Evaluate**: Based on the scenario prompt and the current page
   state (screenshot + URL + available elements), determine:
   - **Goal reached?** → Exit loop, report success.
   - **Stuck/error page?** → Report failure with what went wrong.
   - **More steps needed?** → Continue to step 4.
4. **Decide next action**: Pick the most logical next interaction to
   advance the flow toward the goal. Consider:
   - Buttons with text like "Continue", "Next", "Submit", "Checkout"
   - Form fields that need filling
   - Navigation links that lead toward the goal
   - Modals/dialogs that need dismissal
5. **Execute the action**:
   - For clicks: `browser_click` with the element selector
   - For text input: `browser_type` with appropriate values
   - For navigation: `browser_navigate` if needed
6. Wait briefly for the page to settle, then go back to step 1.

**Exit conditions:**
- Goal reached (success)
- Same page state detected twice in a row (stuck)
- Error page or unrecoverable state detected
- Max iterations (10) reached

### Step 8: Report Results and Findings

After the loop completes:

1. Call `list_run_findings` to get all findings created during execution.
2. For each finding, explain what it means and suggest a fix using
   the `finding-fixes.md` reference.

**Report format:**

> **Scenario Test Complete: {title}**
>
> Status: {PASS/FAIL}
> Pre-defined steps: {N} ({passed}/{failed})
> Self-healing steps: {M} additional interactions
>
> **Flow summary:**
> 1. {what happened at each major step}
> 2. ...
>
> {If failed: explain where the flow got stuck and why}
> {If passed: confirm the goal was reached}
>
> **Findings ({F}):**
> - [{severity}] {title}: {description}
>   - **Page:** {path where it occurred}
>   - **Why it matters:** {explanation}
>   - **Fix:** {suggested fix}
> - ...
>
> {If no findings: "No issues found during this flow."}

Always report findings even if the flow succeeded — issues like
console errors, slow responses, or accessibility problems can occur
during an otherwise passing flow.

### Step 8b: Cleanup

Always call `browser_close` when done.

---

## Flow C: Full Site Scan (requires API key)

### Step 7: Start Discovery Scan

**For local development** (recommended):

1. Call `start_scan` with the URL to create the test run.
2. Call `execute_run` with the run ID, runner ID, and base URL.
   This spawns the bundled runner locally and runs the scan.

**For remote execution** (server-side runner):

1. Call `start_scan` with the URL.
2. Poll `get_run_status` every 10 seconds until status is `completed`
   or `failed`. Show progress:
   > "Scanning... {pages} pages found, {findings} findings so far"

### Step 8: Report Scan Results, Findings, and Personas

1. Call `get_run_summary` for aggregated results.
2. Call `list_run_findings` for all findings.
3. Call `list_run_pages` for discovered pages.
4. Call `list_personas` to get detected personas (auto-generated
   after scan completes).

For each finding, explain what it means and suggest a fix using
the `finding-fixes.md` reference.

**Report format:**

> **Full Scan Complete: {URL}**
>
> - Pages discovered: {N}
> - Total findings: {F}
> - Duration: {D}
>
> **Findings by expertise:**
> - Tester: {count}
> - SEO: {count}
> - Security: {count}
> - ...
>
> **All findings:**
> - [{severity}] {title}: {description}
>   - **Page:** {path where it occurred}
>   - **Why it matters:** {explanation}
>   - **Fix:** {suggested fix}
> - ...
>
> **Personas detected:**
> - **{persona title}**: {description}
> - **{persona title}**: {description}
>
> Now that the scan is complete, I can test specific user flows.
> For example:
> "Test it as a {persona title}, {suggested action based on persona}"

---

## Multi-Page Testing

If the user asks to test multiple pages without a full scan:

1. Launch the browser once.
2. For each page: navigate, evaluate health, collect results.
3. Report all results together.
4. Close browser once at the end.

## Finding Detail Drilldown

After reporting findings (in any flow), always offer:

> "Want details on any of these findings? I can show the full context
> and a Playwright script to reproduce it."

When the user asks about a specific finding (by number, title, or
description):

1. Call `get_finding_detail` (testomniac-api) with the finding ID.
2. The response includes:
   - `finding` — full details (title, description, type, priority, path)
   - `interaction` — the test interaction that triggered it
   - `dependencyChain` — all prerequisite interactions in execution order
   - `playwrightScript` — a complete, ready-to-run Playwright test

3. Report the finding detail:

> **Finding: {title}**
>
> **Description:** {description}
> **Severity:** {type} (priority {priority})
> **Page:** {path}
>
> **What happened:** {explain in plain language what the test did and
> what went wrong, based on the interaction title and finding description}
>
> **Reproduction steps:**
> {Number each interaction in the dependency chain}
> 1. {dependency interaction 1 title}
> 2. {dependency interaction 2 title}
> 3. {the interaction that found the issue}
>
> **Playwright script to reproduce:**
> ```typescript
> {playwrightScript}
> ```
>
> You can run this with `npx playwright test` or paste it into
> Playwright's UI mode (`npx playwright test --ui`).

If the user asks to run the Playwright script directly, use
`browser_evaluate` or the Playwright MCP tools if available.

## Re-verification

After fixing issues, offer to re-run:
> "Want me to re-run the check to verify the fixes?"

## Error Handling

Always give the user a clear next action — never just report an
error without telling them how to fix it.

| Error | Response |
|-------|----------|
| Browser launch fails | "Chromium may not be installed. Try running `bun install` in the testomniac_runner_mcp directory, or set the `CHROMIUM_PATH` environment variable to your Chrome/Chromium binary." |
| Page fails to load | "Could not load {URL} (HTTP {status}). Is the URL correct? If it's a local dev server, make sure it's running." |
| API tools not available | "The Testomniac API MCP server is not connected. To use scans, scenarios, and persona detection, add the `testomniac-api` MCP server to your Claude Code settings." |
| API auth error | "Your API key is missing or invalid. To get one, go to [https://testomniac.com](https://testomniac.com), sign in, and create an API key in your organization settings. Then tell me: `Set the testomniac API key to tst_your_key_here`" |
| "No pages discovered yet" | "The site hasn't been scanned yet. I need to discover pages before generating test scenarios. Want me to run a full scan first?" |
| "AI features not configured" | "AI-powered features (persona detection, test generation) are not enabled on the API server. Contact your Testomniac administrator." |
| Entity slug unknown | "What's your Testomniac organization name? You can find it at [https://testomniac.com](https://testomniac.com) in your organization settings." |
| No products found | "No products found. Create one at [https://testomniac.com](https://testomniac.com), or run a full scan which will set one up automatically." |
