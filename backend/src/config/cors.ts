import type { CorsOptions } from "cors";
import { env } from "./env";
import { logger } from "../lib/logger";

/** Strip trailing slash so `https://app.com` matches `https://app.com/`. */
function normalizeOrigin(url: string): string {
  return url.replace(/\/$/, "");
}

const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

const EXTRA_ALLOWED_ORIGINS = new Set(
  env.CORS_ALLOWED_ORIGINS.split(",")
    .map((s: string) => normalizeOrigin(s.trim()))
    .filter(Boolean),
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Vercel preview hosts for this project only: `<project>-<hash|git-branch>-<scope>.vercel.app`.
 * Disabled (null) unless both CORS_VERCEL_PROJECT and CORS_VERCEL_SCOPE are set,
 * so an attacker-owned *.vercel.app project is never trusted.
 */
const VERCEL_PREVIEW_PATTERN: RegExp | null =
  env.CORS_VERCEL_PROJECT && env.CORS_VERCEL_SCOPE
    ? new RegExp(
        `^https://${escapeRegExp(env.CORS_VERCEL_PROJECT)}-[a-z0-9-]+-${escapeRegExp(env.CORS_VERCEL_SCOPE)}\\.vercel\\.app$`,
        "i",
      )
    : null;

/**
 * CORS: allow browser clients from local dev, FRONTEND_URL, optional comma list,
 * and this project's own Vercel preview deployments (see VERCEL_PREVIEW_PATTERN).
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalized = normalizeOrigin(origin);

    if (LOCAL_ORIGINS.has(normalized)) {
      callback(null, true);
      return;
    }

    if (normalized === normalizeOrigin(env.FRONTEND_URL)) {
      callback(null, true);
      return;
    }

    if (EXTRA_ALLOWED_ORIGINS.has(normalized)) {
      callback(null, true);
      return;
    }

    if (VERCEL_PREVIEW_PATTERN?.test(normalized)) {
      callback(null, true);
      return;
    }

    logger.warn(
      { origin: normalized, service: "api" },
      "CORS request blocked for origin",
    );
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "x-idempotency-key",
  ],
};
