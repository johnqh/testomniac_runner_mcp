---
name: test-app
description: Use when testing a web application, verifying UI changes, checking page health, running accessibility/SEO/security/performance audits, or validating a web page. Trigger on /test-app, "test this page", "check for bugs", "run a health check", "audit this URL", "verify my changes work", or after making frontend changes when the user wants to confirm they work.
---

# Test App

Test a web page or application using Testomniac's browser automation
and expertise evaluation tools.

## Prerequisites

This skill requires the `testomniac-runner` MCP server. All tool names
below are prefixed with the MCP server key from settings.json (e.g.,
`browser_launch` becomes the MCP tool `browser_launch` under the
`testomniac-runner` server).

## Step 1: Determine Target URL

Resolve the URL to test:

1. If the user provided a URL, use it.
2. If the project's CLAUDE.md has a "Testing with Testomniac" section,
   use the dev server URL from there.
3. If neither, ask: "What URL should I test?"

For local dev servers, check if the server is running first (e.g.,
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`). If
not running, tell the user to start it.

## Step 2: Quick Health Check (default)

Run this tier automatically. It takes about 30 seconds.

1. Call `browser_launch` with default viewport.
2. Call `browser_navigate` with the target URL.
3. Call `browser_screenshot` to capture the page.
4. Call `evaluate_page_health` to check for broken images, dead links,
   overlapping elements, console errors, price errors, placeholder
   text, accessibility issues, and more.
5. Call `extract_actionable_items` to inventory interactive elements
   (buttons, links, inputs, forms).

**Report format:**

> **Quick Health Check: {URL}**
>
> Page loaded successfully. Found {N} interactive elements.
>
> **{M} issue(s) found:**
> - [severity] {title}: {description}
>   - **Fix:** {suggested fix}
>
> Want a deeper analysis? I can run SEO, security, accessibility,
> performance, and content audits.

If no issues are found, say so and offer the deeper analysis.

Always show the screenshot so the user can see the page.

## Step 3: Targeted Analysis (on request)

Run when the user asks for deeper analysis, or says "yes" to the
offer after the quick check.

1. Call `run_all_expertises` to evaluate all 7 expertise modules:
   Tester, SEO, Security, Performance, Content, UI, Accessibility.
2. Call `detect_scaffolds` to identify page structure (header, footer,
   navigation, sidebar).
3. Call `extract_forms` if forms are present on the page.
4. Call `detect_login_page` if the page looks like a login page.

**Report format:**

Group findings by expertise. For each finding:
- State the issue clearly
- Explain why it matters
- Suggest a concrete code fix when possible (reference the
  `finding-fixes.md` reference file for common patterns)

At the end, offer: "Want me to fix any of these issues?" or "Want a
full multi-page scan?"

## Step 4: Full Scan (explicit request only)

This tier requires the Testomniac API server to be running. It crawls
multiple pages and runs all checks across the entire site.

> Note: This requires `TESTOMNIAC_API_URL` and `TESTOMNIAC_API_KEY`
> to be configured. If not available, tell the user.

The full scan uses the `testomniac-api` MCP server (separate from the
runner). If those tools are not available, explain that full scans
require the API MCP server to be configured.

1. Call `start_scan` with the URL.
2. Poll `get_run_status` every 10 seconds until status is `completed`
   or `failed`. Show progress updates.
3. Call `get_run_summary` for the aggregated results.
4. Call `list_run_findings` for all findings.
5. Call `list_run_pages` for discovered pages.

**Report format:**

> **Full Scan Complete: {URL}**
>
> - Pages discovered: {N}
> - Page states: {M}
> - Total findings: {F}
> - Duration: {D}
>
> **Findings by expertise:**
> - Tester: {count}
> - SEO: {count}
> - ...
>
> **Top issues:**
> 1. [severity] {title} on {path}
> 2. ...

## Step 5: Cleanup

Always call `browser_close` when done testing, even if errors occurred.

## Multi-Page Testing

If the user asks to test multiple pages:

1. Launch the browser once.
2. For each page:
   a. `browser_navigate` to the URL
   b. `evaluate_page_health`
   c. Collect results
3. Report all results together.
4. Close browser once at the end.

## Re-verification

After fixing issues, offer to re-run the health check:

> "Want me to re-run the health check to verify the fixes?"

If yes, repeat Step 2 on the same URL.

## Error Handling

- **Browser launch fails:** Tell the user Chromium may not be
  installed. Suggest checking the MCP server logs.
- **Page fails to load:** Report the HTTP status and suggest checking
  the URL or dev server.
- **MCP tools not available:** Tell the user to configure the
  testomniac-runner MCP server in Claude Code settings.
- **API server not running (for full scans):** Explain that full scans
  need the API. Suggest using Tier 1/2 instead.
