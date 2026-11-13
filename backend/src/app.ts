import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import mongoose from "mongoose";
import webhookRoutes from "./features/auth/routes";
import stripeWebhookRoutes from "./features/billing/webhook.routes";
import { clerkMiddleware } from "@clerk/express";
import { logger } from "./lib/logger";
import { initSentry, Sentry } from "./lib/sentry";
import { corsOptions } from "./config/cors";
import { generalLimiter } from "./middlewares/rate-limiter";
import { env, appEnv } from "./config/env";

import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

// Feature Routes
import assistantRoutes from "./features/assistant/routes";
import plannerRoutes from "./features/planner/routes";
import userRoutes from "./features/user/routes";
import billingRoutes from "./features/billing/routes";
import devRoutes from "./features/dev/routes";
import calendarRoutes from "./features/calendar/routes";
import { isCalendarSyncEnabled } from "./features/calendar/calendar-feature-flag";
import destinationRoutes from "./features/destinations/routes";
import weatherRoutes from "./features/weather/routes";
import { isDevRoutesEnabled } from "./features/dev/dev-routes-flag";
import { isApiDocsEnabled } from "./lib/api-docs-flag";
import reliabilityRoutes from "./features/reliability/routes";
import { isReliabilityApiEnabled } from "./features/reliability/reliability-flag";
import { createBullBoardRouter } from "./features/reliability/bull-board";
import analyticsRoutes from "./features/analytics/routes";
import { isAnalyticsEnabled } from "./features/analytics/analytics-flag";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TravelPlan API",
      version: "0.1.0",
      description: "API documentation for TravelPlan application",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: "Development server",
      },
    ],
  },
  apis: ["./routes/*.ts", "./features/*/routes.ts"], // Path to route files
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Builds the Express app without starting a listener or connecting to
 * Mongo/Redis — lets integration tests (supertest) and the real server
 * entrypoint (index.ts) share the exact same middleware/route wiring.
 */
export function createApp(): Express {
  initSentry("api");

  const app: Express = express();

  // ============================================
  // MIDDLEWARE ORDER MATTERS!
  // ============================================

  //1. CORS — see ./config/cors.ts (Vercel previews, FRONTEND_URL, optional list)
  app.use(cors(corsOptions));
  //2. Webhook routes - BEFORE express.json() for signature verification
  app.use(
    "/api/webhooks",
    express.raw({ type: "application/json" }),
    webhookRoutes, // Auth (clerk) hooks inside here use /clerk
    stripeWebhookRoutes, // Billing (stripe) hooks inside here use /stripe
  );

  // 3. Clerk middleware - After webhooks. Passed explicitly (rather than
  // relying on @clerk/express reading process.env itself) so a missing key
  // is caught by envalid's fail-fast at boot, not at the first request.
  app.use(
    clerkMiddleware({
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    }),
  );

  // 3.5 General rate limiter — after Clerk (so req.auth is populated) and
  // before body parsers, covering every route below except /api/webhooks
  // (mounted above, step 2) and /health, /ready (skipped, see rate-limiter.ts)
  app.use(generalLimiter);

  // 4. Body parsers - For regular API routes
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // 5. Swagger — never in production; the spec has no auth of its own
  if (isApiDocsEnabled()) {
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  // 5.5 Welcome root endpoint
  app.get("/", (req: Request, res: Response) => {
    res.json({ message: "TravelPlan API is live and connected to Atlas!" });
  });

  // 6. API Routes
  app.use("/api/ai", assistantRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/billing", billingRoutes);
  // Dev-only admin endpoints — mounted only in local development. Each
  // controller also keeps its own env.NODE_ENV guard as defense-in-depth.
  if (isDevRoutesEnabled()) {
    app.use("/api/dev", devRoutes);
    // Bull Board — drill-down queue inspector, dev-only for the same
    // reason /api/dev is: this app's origin (Railway) differs from the
    // frontend's (Vercel), so the Clerk session cookie never reaches a
    // request typed directly into this URL — requireAuth() would 401
    // every time, and there's no precedent in this repo for a basic-auth
    // fallback. See reliability plan Phase 7 for the full reasoning.
    app.use("/admin/queues", createBullBoardRouter());
  }
  app.use("/api", plannerRoutes);
  app.use("/api", weatherRoutes);
  if (isCalendarSyncEnabled()) {
    app.use("/api", calendarRoutes);
  }
  app.use("/api/destinations", destinationRoutes);
  // Reliability/SLO dashboard read API — off everywhere by default,
  // including local dev (see reliability-flag.ts). 3-layer security:
  // this mount flag → requireUserAuth (routes.ts) → allowlist (controller).
  if (isReliabilityApiEnabled()) {
    app.use("/api/reliability", reliabilityRoutes);
  }
  // Analytics event ingest (B2) — off unless ANALYTICS_ENABLED=true; public
  // (anonymous visitors log too), metered by its own limiter in routes.ts.
  if (isAnalyticsEnabled()) {
    app.use("/api/analytics", analyticsRoutes);
  }

  //7. Health checks
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", env: appEnv, timestamp: new Date() });
  });

  // Ready check (verifies DB + Redis connectivity)
  app.get("/ready", async (req: Request, res: Response) => {
    try {
      // Check MongoDB
      const mongoStatus =
        mongoose.connection.readyState === 1 ? "connected" : "disconnected";

      // Check Redis (import redisConnection from queue.ts)
      const { redisConnection } = await import("./lib/queue");
      await redisConnection.ping();

      if (mongoStatus !== "connected") {
        return res.status(503).json({
          status: "not_ready",
          env: appEnv,
          mongodb: mongoStatus,
          redis: "connected",
          timestamp: new Date(),
        });
      }

      res.json({
        status: "ready",
        env: appEnv,
        mongodb: mongoStatus,
        redis: "connected",
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error({ err: error }, "Readiness check failed (Mongo or Redis)");
      res.status(503).json({
        status: "not_ready",
        env: appEnv,
        error: "Service dependencies unavailable",
        timestamp: new Date(),
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { detail: error.message }
          : {}),
      });
    }
  });

  // 8. Global error handler (MUST BE LAST)
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, stack: err.stack }, "Unhandled error");
    Sentry.captureException(err);

    res.status(500).json({
      success: false,
      message: "An unexpected error occured",
      error: process.env.NODE_ENV === "production" ? {} : err.message,
    });
  });

  return app;
}
