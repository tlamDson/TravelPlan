import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // *.integration.test.ts needs real Mongo/Redis + the integration setup
    // file (vitest.integration.config.ts, `npm run test:integration`) — keep
    // them out of the plain unit run.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
    // Tests that `await import()` heavy modules (stripe, Gemini SDK, models)
    // exceed the 5 s default when the full suite runs under CPU load.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Hermetic defaults for envalid's fail-fast required vars (config/env.ts),
    // so unit tests don't depend on a local .env file or CI-provided secrets.
    // Mirrors the dummy values ci-pr.yml sets for the "Unit Tests" step.
    env: {
      NODE_ENV: "test",
      MONGO_URI:
        "mongodb://test_user:test_password@localhost:27017/test_db?authSource=admin",
      CLERK_SECRET_KEY: "sk_test_dummy_key_for_tests",
      // Must be valid base64 after the "whsec_" prefix — svix's Webhook
      // constructor throws "Base64Coder: incorrect characters for decoding"
      // otherwise (verified while adding webhooks-clerk.integration.test.ts).
      // Built from a readable string, not a hardcoded blob — a static
      // base64 literal here reads as a real secret to entropy-based
      // scanners (GitGuardian false positive), same as CLERK_PUBLISHABLE_KEY
      // below.
      CLERK_WEBHOOK_SIGNING_SECRET:
        "whsec_" +
        Buffer.from("integration-test-clerk-webhook-secret-32").toString(
          "base64",
        ),
      GEMINI_API_KEY: "sk-dummy-key-for-tests",
      // billing/stripe.service.ts does `new Stripe(env.STRIPE_SECRET_KEY)` at
      // *import* time — an empty key throws immediately, so any test that
      // transitively imports app.ts/billing routes needs this set.
      STRIPE_SECRET_KEY: "sk_test_dummy_key_for_tests",
      // Required by envalid (config/env.ts) — clerkMiddleware() is now
      // passed this explicitly in app.ts rather than reading process.env
      // itself, so importing app.ts without it fails at cleanEnv, not at
      // the first request.
      CLERK_PUBLISHABLE_KEY:
        "pk_test_" + Buffer.from("clerk.example.com$").toString("base64"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**"],
    },
  },
});
