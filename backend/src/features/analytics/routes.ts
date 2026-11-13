import { Router } from "express";
import { analyticsLimiter } from "../../middlewares/rate-limiter";
import { postAnalyticsEvents } from "./controllers/analytics.controller";

const router = Router();

router.post("/events", analyticsLimiter, postAnalyticsEvents);

export default router;
