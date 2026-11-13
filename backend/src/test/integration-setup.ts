import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

// Hermetic-but-overridable defaults: CI (ci-pr.yml) sets these explicitly for
// the job's mongo/redis services; a local run falls back to the credentials
// docker-compose.yml provisions (`docker compose up -d mongodb redis`).
process.env.NODE_ENV ??= "test";
process.env.MONGO_URI ??=
  "mongodb://travelplan_admin:dev_password_change_in_prod@localhost:27017/travelplan_test?authSource=admin";
process.env.REDIS_HOST ??= "localhost";
process.env.REDIS_PORT ??= "6379";
process.env.REDIS_PASSWORD ??= "dev_redis_password";
process.env.CLERK_SECRET_KEY ??= "sk_test_dummy_key_for_tests";
// [BUG, found while adding webhooks-clerk.integration.test.ts] the old
// default "whsec_dummy_secret" is not valid base64 (underscore isn't in the
// base64 alphabet) — `new Webhook(secret)` from svix throws
// "Base64Coder: incorrect characters for decoding" at construction time, so
// authService.handleWebhooks() would 500 on every real Clerk webhook if this
// value were ever used outside tests. Also hardcoded in ci-pr.yml — kept in
// sync there.
process.env.CLERK_WEBHOOK_SIGNING_SECRET ??=
  "whsec_" +
  Buffer.from("integration-test-clerk-webhook-secret-32").toString("base64");
// @clerk/express's clerkMiddleware() (mounted globally in app.ts, ahead of
// every route — including fully public ones like /health) reads
// CLERK_PUBLISHABLE_KEY straight from process.env on every request and
// throws "Publishable key is missing" if it's unset, even though
// config/env.ts never declares this var as required. Must be a
// realistically-shaped pk_test_<base64(host$)> key or Clerk's own format
// check rejects it before ever getting to "missing".
process.env.CLERK_PUBLISHABLE_KEY ??=
  "pk_test_" + Buffer.from("clerk.example.com$").toString("base64");
process.env.GEMINI_API_KEY ??= "sk-dummy-key-for-tests";
// billing/stripe.service.ts does `new Stripe(env.STRIPE_SECRET_KEY)` at
// *import* time (not lazily) — an empty key throws immediately, which means
// importing the full app (createApp() -> billing routes) fails without this.
// This is itself a real finding: any deployment missing STRIPE_SECRET_KEY
// would crash at server boot, not just when a billing endpoint is hit.
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy_key_for_tests";
// Needed to sign+verify test Stripe webhook payloads with
// `stripe.webhooks.generateTestHeaderString()` / `constructEvent()`.
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_" + "x".repeat(24);
// features/analytics/services/pseudonymize.ts refuses to hash userIds with
// a secret shorter than 32 chars; analytics integration tests need one.
process.env.ANALYTICS_HASH_SECRET ??= "integration-test-analytics-hash-secret";

// config/env.ts runs `dotenv.config()` with CWD=backend/, which loads
// backend/.env *before* this setup file runs — so on a machine whose
// backend/.env has a real GOOGLE_PLACES_API_KEY/MAPBOX_ACCESS_TOKEN (normal
// for local dev), `??=` below would never fire and any test that reaches
// validateIntent()/places.service.ts would bill Google Places for real.
// These two are therefore forced unconditionally, not defaulted.
process.env.GOOGLE_PLACES_API_KEY = "";
process.env.MAPBOX_ACCESS_TOKEN = "";

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI!);
}, 20_000);

// Keep integration tests independent — real Mongo, so state genuinely
// persists across `it()` blocks unless we clear it ourselves.
afterEach(async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return;
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

// generalLimiter (backend/src/middlewares/rate-limiter.ts) is mounted
// globally and keyed by IP, backed by a real Redis store shared across every
// test file in this suite (all requests come from the same loopback
// address). Without clearing its keys between tests, unrelated test files
// would start intermittently 429-ing each other depending on run order —
// worse, the 15-minute window means a red run could stay red on immediate
// retry. Scoped to the `rl:general:` and `rl:analytics:` prefixes only, so
// it never touches BullMQ/other app keys sharing the same Redis instance.
afterEach(async () => {
  const { redisConnection } = await import("../lib/queue");
  const keys = [
    ...(await redisConnection.keys("rl:general:*")),
    ...(await redisConnection.keys("rl:analytics:*")),
  ];
  if (keys.length > 0) await redisConnection.del(...keys);
});

afterAll(async () => {
  await mongoose.disconnect();
  // Integration tests reuse the shared local dev Redis (docker-compose) —
  // obliterate every queue our own requests could have touched so leftover
  // test jobs don't pile up in that instance. Skipped per-queue if BullMQ
  // never touched Redis for a given file (e.g. cors/destinations tests).
  const { createQueue } = await import("../lib/queue");
  const { QUEUE_NAMES } = await import("../lib/queue-defaults");
  for (const name of Object.values(QUEUE_NAMES)) {
    try {
      const queue = createQueue(name);
      await queue.obliterate({ force: true });
      await queue.close();
    } catch {
      // Best-effort cleanup only — never fail the suite over it.
    }
  }
});
