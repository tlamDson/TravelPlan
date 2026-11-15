import mongoose, { Schema, Document } from "mongoose";

/**
 * One document per running worker process — the only thing that lets the
 * reliability report tell "queue is idle, worker is healthy" apart from
 * "worker is dead" (both look identical as BullMQ queue counts: "0
 * active, N waiting"). See worker-heartbeat.service.ts for how this gets
 * written and read.
 *
 * TTL is short (24h, not the 35-day JOB_METRIC_TTL_DAYS a JobMetric gets)
 * — only recent heartbeats matter for liveness; a worker's identity from
 * last week is noise, not signal.
 */
const HEARTBEAT_TTL_HOURS = 24;

export interface IWorkerHeartbeat extends Document {
  /** Unique per process lifetime (regenerated on every restart) — see
   * `host` for the stable identity across restarts of the same container. */
  workerId: string;
  /**
   * `os.hostname()` — intended as a stable identity across restarts of
   * the same worker so a rapidly-changing `startedAt` for one `host` can
   * be read as a crash-loop signal. UNVERIFIED on this project's actual
   * infrastructure (Railway): if a crashed worker comes back as a brand
   * new container with a new hostname (common on PaaS platforms that
   * recreate rather than restart), `host` changes together with
   * `workerId` on every crash and this signal doesn't work. Verify by
   * killing `travelplan-worker-staging`'s process and comparing `host`
   * across the heartbeat docs written before/after, before any Phase 6+
   * dashboard relies on this for real crash-loop detection.
   */
  host: string;
  queues: string[];
  concurrency: Record<string, number>;
  /** Changes every restart — a rapidly-changing startedAt for the same
   * `host` is the restart-loop signal (a crash-looping worker looks
   * "alive" via lastBeatAt alone, since it beats normally right up until
   * it crashes again). */
  startedAt: Date;
  lastBeatAt: Date;
  stalledCount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WorkerHeartbeatSchema = new Schema<IWorkerHeartbeat>(
  {
    workerId: { type: String, required: true, unique: true },
    host: { type: String, required: true },
    queues: { type: [String], required: true },
    concurrency: { type: Schema.Types.Mixed, required: true },
    startedAt: { type: Date, required: true },
    lastBeatAt: { type: Date, required: true },
    stalledCount: { type: Number, default: 0 },
    expiresAt: {
      type: Date,
      default: () =>
        new Date(Date.now() + HEARTBEAT_TTL_HOURS * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

WorkerHeartbeatSchema.index({ host: 1, lastBeatAt: -1 });
WorkerHeartbeatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IWorkerHeartbeat>(
  "WorkerHeartbeat",
  WorkerHeartbeatSchema,
);
