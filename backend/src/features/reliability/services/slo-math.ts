import { MIN_EVENTS_FOR_SLI } from "@travelplan/shared";
import type { SliResult, ErrorBudget } from "@travelplan/shared";

/**
 * Pure SLO math — no I/O, no Mongo, no BullMQ. Every function here takes
 * plain numbers/counts in and returns plain numbers/objects out, so the
 * SRE concepts (SLI, error budget, burn rate) can be verified by
 * hand-computed test expectations rather than trusted against the
 * implementation. See slo-math.test.ts for the worked arithmetic.
 */

export interface OutcomeCounts {
  completed: number;
  fallback: number;
  failed: number;
  /**
   * Completed jobs slower than the SLO latency threshold. A subset of
   * `completed` (never a separate bucket in validEvents) — the caller
   * (features/reliability) decides the threshold; this module only knows
   * "this many completions were too slow to count as good".
   */
  slowButCompleted?: number;
}

export interface ComputeSliOptions {
  /**
   * Whether the static-fallback outcome (trip.processor.ts's degraded
   * template path — BullMQ itself reports it as `completed`) counts
   * toward the SLI as good or bad. Made an explicit, visible, testable
   * parameter rather than a buried `if` — this is the single decision
   * that determines whether an AI-provider outage shows up in the SLO.
   */
  fallbackCountsAsGood: boolean;
  /** Overridable for tests; defaults to the shared MIN_EVENTS_FOR_SLI constant. */
  minEventsForSli?: number;
}

/**
 * Computes the headline SLI from raw outcome counts. Returns
 * `sli: null, insufficientData: true` below the minimum event threshold
 * — never a default of 1.0 (a false "everything's fine" during a data
 * gap) and never NaN (a 0/0 division).
 */
export function computeSli(
  counts: OutcomeCounts,
  opts: ComputeSliOptions,
): SliResult {
  // Clamp to [0, completed] — slowButCompleted is documented as a subset
  // of `completed`, but nothing stops a caller from also counting the
  // same job as `fallback` (fallback is naturally the slowest path, since
  // trip.processor.ts only reaches it after 3 exhausted AI retries). Left
  // unclamped, a job double-counted as both fallback AND slowButCompleted
  // pushes badEvents past validEvents, producing a negative goodEvents/sli
  // that violates sliResultSchema's own bounds.
  const slowButCompleted = Math.min(
    Math.max(counts.slowButCompleted ?? 0, 0),
    counts.completed,
  );
  const validEvents = counts.completed + counts.fallback + counts.failed;
  const rawBadEvents =
    counts.failed +
    (opts.fallbackCountsAsGood ? 0 : counts.fallback) +
    slowButCompleted;
  const badEvents = Math.min(rawBadEvents, validEvents);
  const goodEvents = validEvents - badEvents;

  const minEvents = opts.minEventsForSli ?? MIN_EVENTS_FOR_SLI;
  const insufficientData = validEvents < minEvents;

  return {
    validEvents,
    goodEvents,
    badEvents,
    sli: insufficientData ? null : goodEvents / validEvents,
    insufficientData,
  };
}

/**
 * Burn rate = (observed bad-event rate) / (error-budget fraction). A burn
 * rate of 1.0 sustained for a full window exactly exhausts the budget by
 * the window's end; 14.4 exhausts a 28-day budget in ~2 days (the SRE
 * Workbook's canonical fast-burn threshold).
 *
 * Returns 0 when the SLI is null (insufficient data) — a fabricated burn
 * rate would be worse than no signal; callers must check
 * `sli.insufficientData` separately rather than reading 0 as "healthy".
 */
export function computeBurnRate(sli: SliResult, target: number): number {
  if (sli.sli === null) return 0;
  const badRate = 1 - sli.sli;
  const budgetFraction = 1 - target;
  return budgetFraction > 0 ? badRate / budgetFraction : 0;
}

/**
 * Error budget = the number of bad events allowed before the SLO target
 * is missed, given how many valid events were observed. budgetRemaining
 * is clamped at 0 (never negative) so a UI progress bar doesn't need its
 * own clamping logic — but `sli.sli` itself is left untouched, so callers
 * can still see exactly how bad things are, not just "budget: 0".
 */
export function computeErrorBudget(
  sli: SliResult,
  target: number,
): ErrorBudget {
  const budgetTotal = sli.validEvents * (1 - target);
  const budgetConsumed = sli.badEvents;
  const budgetRemaining = Math.max(0, budgetTotal - budgetConsumed);
  const consumedRatio = budgetTotal > 0 ? budgetConsumed / budgetTotal : 0;

  return {
    target,
    budgetTotal,
    budgetConsumed,
    budgetRemaining,
    consumedRatio,
    burnRate: computeBurnRate(sli, target),
    exhaustsAt: null,
  };
}

/**
 * Projects when the remaining budget will hit zero at the current burn
 * rate, assuming the rate holds steady. `windowMs` is the SLO's
 * compliance window (e.g. 28 days) — burn rate is defined relative to
 * "would exhaust a full window's budget in 1/burnRate windows".
 *
 * Returns null when burnRate is 0 (never exhausts). Returns `now`
 * immediately when the budget is already at/below 0.
 *
 * Returns a `Date`, not the ISO string `ErrorBudget.exhaustsAt` expects
 * (`errorBudgetSchema` in @travelplan/shared) — callers assembling a full
 * ErrorBudget must `.toISOString()` this before assigning it, or
 * `errorBudgetSchema.parse()` will reject the result downstream.
 */
export function projectExhaustion(
  budget: ErrorBudget,
  windowMs: number,
  now: Date,
): Date | null {
  if (budget.burnRate <= 0) return null;

  const remainingFraction =
    budget.budgetTotal > 0 ? budget.budgetRemaining / budget.budgetTotal : 0;
  if (remainingFraction <= 0) return now;

  const msRemaining = (remainingFraction / budget.burnRate) * windowMs;
  return new Date(now.getTime() + msRemaining);
}
