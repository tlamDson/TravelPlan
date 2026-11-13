import { Router } from "express";
import { analyticsLimiter } from "../../middlewares/rate-limiter";
import {
  postAnalyticsEvents,
  postSimulatedAnalyticsEvents,
} from "./controllers/analytics.controller";
import { assertSimIngestAllowed, isSimIngestEnabled } from "./sim-ingest-flag";

const router = Router();

router.post("/events", analyticsLimiter, postAnalyticsEvents);

// simkit load driver (B2 plan, PR 16): local only, off by default. Not
// behind analyticsLimiter on purpose — 1k virtual users post from one IP.
// assertSimIngestAllowed() crashes the boot under NODE_ENV=production.
if (isSimIngestEnabled()) {
  assertSimIngestAllowed();
  router.post("/sim/events", postSimulatedAnalyticsEvents);
}

export default router;
