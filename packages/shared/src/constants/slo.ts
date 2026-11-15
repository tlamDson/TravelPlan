/**
 * SLO constants for the trip-generation reliability layer
 * (backend/src/features/reliability/).
 *
 * Deliberately constants, not env vars — an SLO is a reviewed,
 * version-controlled commitment. Making the target a runtime knob would
 * let someone "fix" a missed SLO by lowering it on the deploy dashboard
 * with no diff and no review.
 */

/** Fraction (not percentage) of valid job-generation events that must be `completed` within SLO_LATENCY_THRESHOLD_MS over the compliance window. */
export const SLO_TARGET = 0.9;

/** A `completed` job slower than this counts as a bad event for SLI purposes, even though BullMQ itself reports it as successful. */
export const SLO_LATENCY_THRESHOLD_MS = 180_000;

/** Rolling compliance window for the headline SLI/error-budget number. */
export const SLO_WINDOW_DAYS = 28;

/** Short burn-rate window — a spike here means "page someone now". */
export const FAST_BURN_WINDOW_HOURS = 1;

/** Medium burn-rate window — a sustained trend worth a daytime look. */
export const SLOW_BURN_WINDOW_HOURS = 6;

/**
 * Below this many valid events in a window, the SLI is noise, not signal
 * — a single failure at low volume can swing the ratio by several points.
 * The report must return `insufficientData: true` instead of a
 * confident-looking percentage.
 */
export const MIN_EVENTS_FOR_SLI = 30;

/**
 * Mongo TTL for JobMetric documents. Must exceed SLO_WINDOW_DAYS — see
 * the constants test for why (a shorter TTL evicts the oldest slice of
 * the compliance window before it closes, silently biasing the SLI up).
 */
export const JOB_METRIC_TTL_DAYS = 35;

/** How often the worker process upserts its liveness heartbeat. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * `consumedRatio` at or above this is "warning" in the reliability
 * dashboard — three quarters of the error budget gone with the window
 * still open is worth surfacing before it's fully burned.
 */
export const ERROR_BUDGET_WARNING_RATIO = 0.75;

/**
 * `consumedRatio` at or above this is "critical" — the budget is fully
 * consumed, meaning the SLO is already missed for this window.
 */
export const ERROR_BUDGET_CRITICAL_RATIO = 1;

/**
 * A worker is considered dead once its last heartbeat is older than this.
 * Set to 3x the interval so one delayed beat (GC pause, network jitter)
 * doesn't falsely report a healthy worker as down.
 */
export const WORKER_LIVENESS_TIMEOUT_MS = 45_000;
