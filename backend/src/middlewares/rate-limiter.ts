import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisConnection } from "../lib/queue";
import { ClerkRequest } from "../types/express";
import { isAnalyticsEnabled } from "../features/analytics/analytics-flag";
import { userOrIpRateLimitKey } from "./rate-limit-key";

export const GENERAL_RATE_LIMIT_MAX = 100;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: GENERAL_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Liveness/readiness probes (Railway, Docker healthcheck) hit these paths
  // frequently and share the app-wide IP-keyed budget with real traffic —
  // never let infra polling exhaust it and 429 real requests.
  //
  // /api/analytics/* has its own budget (analyticsLimiter below) while
  // mounted: batched background tracking must never spend the budget real
  // API calls need. When the flag is off the 404s stay metered here.
  skip: (req) =>
    req.path === "/health" ||
    req.path === "/ready" ||
    (req.path.startsWith("/api/analytics/") && isAnalyticsEnabled()),
  store: new RedisStore({
    sendCommand: async (...args: any[]): Promise<any> => {
      const [command, ...commandArgs] = args;
      return redisConnection.call(command, ...commandArgs);
    },
    prefix: "rl:general:",
  }),
  message: {
    error: "Too many requests, please try again later.",
  },
});

export const tripCreationLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  // Anti-spam limiter only. Plan limits are enforced by userQuotaService.
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const userId = (req as ClerkRequest).auth?.()?.userId;
    if (userId) return `user:${userId}`;
    return ipKeyGenerator(req, res);
  },
  skip: (req) => !(req as ClerkRequest).auth?.()?.userId,
  store: new RedisStore({
    sendCommand: async (...args: any[]): Promise<any> => {
      const [command, ...commandArgs] = args;
      return redisConnection.call(command, ...commandArgs);
    },
    prefix: "rl:trip_create:",
  }),
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many trip creation attempts",
      message: "Please wait a moment and try again.",
      retryAfter: res.getHeader("Retry-After"),
    });
  },
});

export const ANALYTICS_RATE_LIMIT_MAX = 60;

/**
 * POST /api/analytics/events — one batch carries up to
 * ANALYTICS_BATCH_MAX_EVENTS events, so 60 batches/min per user (or per IP
 * for anonymous visitors) is far above what the web client sends.
 */
export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ANALYTICS_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpRateLimitKey,
  store: new RedisStore({
    sendCommand: async (...args: any[]): Promise<any> => {
      const [command, ...commandArgs] = args;
      return redisConnection.call(command, ...commandArgs);
    },
    prefix: "rl:analytics:",
  }),
  message: {
    success: false,
    error: "Too many analytics requests, please try again later.",
  },
});
