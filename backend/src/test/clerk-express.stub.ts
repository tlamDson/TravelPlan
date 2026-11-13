/**
 * Test double for `@clerk/express`, wired in via `resolve.alias` in
 * vitest.integration.config.ts — so EVERY integration test file runs against
 * this stub, never against real Clerk session verification. Auth identity
 * comes from the `x-test-user-id` request header (see `asUser()` in
 * integration-fixtures.ts).
 *
 * This replaces the `vi.mock("@clerk/express", ...)` block that used to be
 * copy-pasted byte-identical into every integration test file — `vi.mock` is
 * hoisted above imports, so a shared helper can't be a plain imported
 * function; aliasing the module at resolution time sidesteps that.
 *
 * Consequence to be aware of: no integration test can exercise real Clerk
 * middleware behavior. That is intentional — token verification is Clerk's
 * responsibility; the E2E layer covers the real end-to-end token path.
 */
type Next = () => void;
type StubRequest = {
  headers: Record<string, string | undefined>;
  auth?: () => { userId: string } | null;
};
type StubResponse = { status: (n: number) => { json: (b: unknown) => void } };

// Like the real clerkMiddleware, populates req.auth for routes that are
// public but identity-aware (e.g. POST /api/analytics/events). Only when the
// header is present, so header-less requests keep `req.auth` undefined —
// every pre-existing auth-dependent route sits behind requireAuth anyway.
export const clerkMiddleware =
  () => (req: StubRequest, _res: StubResponse, next: Next) => {
    const userId = req.headers["x-test-user-id"];
    if (userId) req.auth = () => ({ userId });
    next();
  };

export const requireAuth =
  () => (req: StubRequest, res: StubResponse, next: Next) => {
    const userId = req.headers["x-test-user-id"];
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    req.auth = () => ({ userId });
    next();
  };
