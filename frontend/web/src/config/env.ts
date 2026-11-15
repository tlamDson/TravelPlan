/**
 * Environment Configuration
 *
 * Section 4.2: Secrets Management
 * - No private keys in frontend (VITE_GEMINI_API_KEY must NEVER exist)
 * - Mapbox tokens are public but URL-restricted in dashboard
 */

// API Configuration
export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000/api";
export const ENV = import.meta.env.VITE_ENV || "development";

// Clerk Authentication (Public Key)
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Mapbox (Public Token - URL restricted in Mapbox dashboard)
export const MAPBOX_TOKEN =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;

// Sentry error tracking — empty = disabled (initSentry() in main.tsx no-ops)
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

// Feature Flags
export const IS_DEV = ENV === "development";
export const IS_STAGING = ENV === "staging";
// Vercel builds every deployment (including staging previews) via `vite
// build` in production mode, so import.meta.env.PROD is true regardless of
// VITE_ENV — that's the signal a "real" production build vs dev server uses.
// Staging is carved back out via IS_STAGING so it isn't treated as prod.
export const IS_PROD = import.meta.env.PROD && !IS_STAGING;
export const DEBUG = import.meta.env.VITE_DEBUG === "true";

/**
 * Google Calendar sync UI:
 * - **Vite dev** (`npm run dev`): shown by default for local testing.
 * - **Production build**: hidden unless `VITE_ENABLE_GOOGLE_CALENDAR_SYNC=true` (staging / rollout).
 * - Set `VITE_ENABLE_GOOGLE_CALENDAR_SYNC=false` to hide even in dev (optional).
 */
const calendarExplicitOff =
  import.meta.env.VITE_ENABLE_GOOGLE_CALENDAR_SYNC === "false";
const calendarExplicitOn =
  import.meta.env.VITE_ENABLE_GOOGLE_CALENDAR_SYNC === "true";
export const ENABLE_GOOGLE_CALENDAR_SYNC =
  !calendarExplicitOff && (import.meta.env.DEV || calendarExplicitOn);

// Validation: Fail fast if critical keys are missing.
// Keyed off the raw Vite build mode (import.meta.env.PROD), not IS_PROD —
// staging builds are also `vite build` in production mode (see IS_PROD
// above), and a staging deploy missing the Clerk key should fail loudly
// too, not render a broken auth shell.
if (!CLERK_PUBLISHABLE_KEY && import.meta.env.PROD) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in a production build");
}
