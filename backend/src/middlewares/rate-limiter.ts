import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisConnection } from "../lib/queue";
import { ClerkRequest } from "../types/express";
import { userOrIpRateLimitKey } from "./rate-limit-key";
import { skipGeneralLimit } from "./rate-limit-skip";

export const GENERAL_RATE_LIMIT_MAX = 100;

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: GENERAL_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipGeneralLimit,
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

export const JOB_STATUS_RATE_LIMIT_MAX = 300;

/**
 * GET /api/jobs/:jobId — excluded from generalLimiter (see
 * rate-limit-skip.ts). The web poller backs off from 1s to 5s, so one
 * generation costs a few dozen polls; 300 per 15 min per user still covers
 * several concurrent generations while capping a runaway client.
 */
export const jobStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: JOB_STATUS_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpRateLimitKey,
  store: new RedisStore({
    sendCommand: async (...args: any[]): Promise<any> => {
      const [command, ...commandArgs] = args;
      return redisConnection.call(command, ...commandArgs);
    },
    prefix: "rl:job_status:",
  }),
  message: {
    error: "Too many job status requests, please try again later.",
  },
});
