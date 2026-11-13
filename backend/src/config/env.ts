import { cleanEnv, str, port } from "envalid";
import dotenv from "dotenv";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "test", "production"],
    default: "development",
  }),
  // envalid's NODE_ENV has no "staging" choice (its choices gate real
  // runtime behavior — dev transport, etc.), so staging deploys run
  // NODE_ENV=production and use this separate var to self-report which
  // environment they actually are (surfaced on /health, /ready, and log
  // lines via `appEnv` below). Optional: unset falls back to NODE_ENV.
  APP_ENV: str({ default: "" }),
  PORT: port({ default: 3000 }),
  MONGO_URI: str({ desc: "MongoDB Connection String" }),
  CLERK_SECRET_KEY: str({ desc: "Clerk Secret Key" }),
  CLERK_WEBHOOK_SIGNING_SECRET: str({ desc: "Clerk Webhook Signing Secret" }),
  // clerkMiddleware() is mounted globally in app.ts (ahead of every route,
  // including public ones) and reads this straight from @clerk/express's
  // own options — without it passed explicitly, @clerk/express falls back
  // to reading process.env itself and throws "Publishable key is missing"
  // on every request. Previously undeclared here, so a deployment missing
  // it would only fail at first *request*, not at boot.
  CLERK_PUBLISHABLE_KEY: str({ desc: "Clerk Publishable Key" }),
  REDIS_HOST: str({ default: "localhost" }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str({ desc: "Redis Password", default: "" }), // Optional for local dev
  /** If set (e.g. Railway `redis://...`), overrides REDIS_HOST/PORT/PASSWORD for connection. Use `redis://` (plain) or `rediss://` (TLS). */
  REDIS_URL: str({ default: "" }),
  /** Empty = autodetect (TLS for Upstash-style hosts; plain TCP for Docker `redis`, localhost, railway.internal). Set "true"/"false" to override. */
  REDIS_TLS: str({ default: "" }),
  GEMINI_API_KEY: str({ desc: "Gemini API Key — required for Worker service" }), // Fail Fast: crash if missing
  MAPBOX_ACCESS_TOKEN: str({ desc: "Mapbox Access Token", default: "" }), // Week 3
  GOOGLE_PLACES_API_KEY: str({ desc: "Google Places API Key", default: "" }), // Week 3
  FRONTEND_URL: str({
    desc: "Frontend URL for CORS and redirects",
    default: "http://localhost:5173",
  }),
  /** Comma-separated extra browser origins allowed by CORS (e.g. alternate domains). */
  CORS_ALLOWED_ORIGINS: str({ default: "" }),
  STRIPE_SECRET_KEY: str({ desc: "Stripe Secret Key", default: "" }),
  STRIPE_WEBHOOK_SECRET: str({
    desc: "Stripe Webhook Secret for Local Dev",
    default: "",
  }),
  SERPER_API_KEY: str({
    desc: "Serper.dev API Key for local insight scraping (RAG)",
    default: "",
  }),
  /** When "true", POST /trips/:id/sync-calendar is allowed. When unset in production, calendar sync is off. */
  ENABLE_GOOGLE_CALENDAR_SYNC: str({ default: "" }),
  /**
   * Comma-separated emails allowed to sync (production). Empty in production = no one.
   * Empty in development = all users allowed (convenience).
   */
  VIP_EMAILS: str({ default: "" }),
  /** OpenWeather API key (server-only). Used by GET /api/weather/forecast proxy. */
  OPENWEATHER_API_KEY: str({ default: "" }),
  /** Override OpenWeather API base (default https://api.openweathermap.org/data/2.5) */
  OPENWEATHER_BASE_URL: str({ default: "" }),
  /** Sentry error tracking. Empty = disabled (initSentry() no-ops) — every
   * environment without a DSN configured yet must still boot cleanly. */
  SENTRY_DSN: str({ default: "" }),
  /** When exactly "true", /api/reliability/* is mounted. Unlike calendar
   * sync, this does NOT default to on in development — an SLO endpoint
   * must be explicitly opted into everywhere, including local dev. */
  ENABLE_RELIABILITY_API: str({ default: "" }),
  /**
   * Comma-separated emails allowed to read /api/reliability/* (production).
   * Empty in production = no one. Empty outside production = everyone —
   * same semantics as VIP_EMAILS, kept separate because "beta tester" and
   * "can see internal reliability data" are different roles.
   */
  SRE_ADMIN_EMAILS: str({ default: "" }),
  /** When exactly "true", POST /api/analytics/events is mounted (B2 event
   * ingest). Off everywhere by default, including local dev — stored events
   * use Atlas free-tier storage, so each environment opts in deliberately. */
  ANALYTICS_ENABLED: str({ default: "" }),
});

/** Which environment this process is actually running as — APP_ENV if set
 * (e.g. "staging"), otherwise NODE_ENV. Use this for anything that should
 * distinguish staging from production; NODE_ENV alone can't (both run
 * NODE_ENV=production). */
export const appEnv = env.APP_ENV || env.NODE_ENV;
