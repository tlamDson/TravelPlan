import type { Router } from "express";
import type { Queue } from "bullmq";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { tripQueue } from "../planner/trip.queue";
import { calendarSyncQueue } from "../calendar/calendar.queue";
import { insightQueue } from "../destinations/jobs/insight-queue";
import { QUEUE_NAMES } from "../../lib/queue-defaults";

/**
 * Dev-only drill-down UI — "what is happening right now, and exactly how
 * did job X fail?". Complements the SLO report (Phase 6), doesn't
 * replace it: no history once a job ages out of Redis, no FALLBACK vs
 * COMPLETED distinction (BullMQ reports both as `completed`), no
 * percentiles, no error budget. Queue state is a gauge; SLI needs an
 * event log — that's exactly why Phase 4 records to Mongo instead of
 * relying on this.
 *
 * Built from QUEUE_NAMES (not a separately hand-maintained list) — a
 * queue added later but never registered here would otherwise be
 * invisible in the UI with no error to notice it by.
 */
const QUEUES: Record<string, Queue> = {
  [QUEUE_NAMES.TRIP_GENERATION]: tripQueue,
  [QUEUE_NAMES.CALENDAR_SYNC]: calendarSyncQueue,
  [QUEUE_NAMES.INSIGHT_SCRAPER]: insightQueue,
};

export function createBullBoardRouter(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: Object.values(QUEUES).map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
