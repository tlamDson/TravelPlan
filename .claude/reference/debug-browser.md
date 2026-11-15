# Debugging bugs through the browser (`chrome-devtools` MCP)

Applies when fixing bugs observable through the browser (UI, frontend behavior, backend errors that only show up when using the web app). A pure backend bug with no UI/network surface is verified with a test.

1. **Before fixing — reproduce:** `navigate_page` to the exact page (e.g. `http://localhost:5173/trips/:tripId`), repeat the exact action that causes the bug, and confirm it with at least one of `take_screenshot` / `take_snapshot` / `list_console_messages` / `list_network_requests`. Observe first; do not infer the cause from reading code alone.
2. **After fixing — verify again:** repeat the exact action from step 1 and confirm the console is clean, the network is correct and the UI is correct. Until you have done this step, do not report "fixed".
3. Read tools (`screenshot`, `snapshot`, `console`, `network`) are auto-allowed; `navigate_page`, `click`, typing and `evaluate_script` ask for confirmation each time.

A dev server in a worktree uses a different port from the main directory (the default 3000/5173 may already be taken).

**Passwordless sign-in:** `clerk impersonate <email> --print` (Clerk CLI, `npm install -g clerk`, TravelPlan app already linked) gets a `__clerk_ticket`, then `evaluate_script`: `window.Clerk.client.signIn.create({ strategy: "ticket", ticket })`. Use it to verify gated pages (e.g. `/reliability` needs an account in `SRE_ADMIN_EMAILS`).

**Boundary with Playwright:** `chrome-devtools` is manual verification for one specific bug/UI step; Playwright (`e2e/`) locks stable business flows against regression. After fixing a bug in a flow that tends to recur, consider adding an E2E spec.
