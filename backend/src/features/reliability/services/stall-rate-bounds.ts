/**
 * Pure statistics for reporting a stall rate honestly at small sample
 * sizes — no I/O, so every expectation in the test file is hand-computed
 * from the formula, same convention as slo-math.ts.
 *
 * B3 needs this because production has only 33 trip-generation jobs before
 * the 2026-04-02 lockDuration tune and 11 after it. At n=11, seeing 0
 * stalls does NOT mean stalls are impossible — the 95% upper bound on the
 * true stall rate is still ~27%. No comparison between "before" and
 * "after" counts is statistically meaningful at this n; only the mechanism
 * test (Track C) can answer what lockDuration actually buys.
 */

/** z-score for a 95% two-sided confidence interval. */
const Z_95 = 1.96;

/**
 * "Rule of three": with 0 observed events in n independent trials, the
 * 95% upper confidence bound on the true event probability is ~3/n.
 * Standard approximation for exactly-zero-event samples (see
 * Hanley & Lippman-Hand, 1983); simpler and more conservative than Wilson
 * for this one case.
 */
export function ruleOfThreeUpperBound(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(3 / n, 1);
}

export interface WilsonIntervalResult {
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion — valid at small n and
 * at the boundaries (p̂=0 or p̂=1), unlike the naive normal approximation.
 */
export function wilsonInterval(
  successes: number,
  n: number,
): WilsonIntervalResult {
  if (!Number.isFinite(n) || n <= 0) return { lower: 0, upper: 1 };

  const pHat = successes / n;
  const z = Z_95;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = pHat + z2 / (2 * n);
  const margin = z * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));

  const lower = Math.max(0, (center - margin) / denom);
  const upper = Math.min(1, (center + margin) / denom);

  return { lower, upper };
}

export interface ResolutionDescription {
  resolvable: boolean;
  nBeforeUpperBoundPct: number;
  nAfterUpperBoundPct: number;
  message: string;
}

/**
 * Above this upper-bound-on-stall-rate, a 0-stall observation is
 * consistent with too wide a range of true rates to call the comparison
 * conclusive. 10% is a judgment call, not a derived constant — it says
 * "resolvable" only when a 0-stall sample would have caught anything
 * worse than a 1-in-10 stall rate.
 */
const RESOLVABLE_UPPER_BOUND_THRESHOLD = 0.1;

/**
 * Can this before/after sample size distinguish "the tune fixed
 * something" from "there was never anything to fix"? Depends only on
 * sample sizes (worst case: zero stalls observed on both sides), not on
 * the actual stall counts — it answers a question about statistical
 * power, not about this specific run's result.
 */
export function describeResolution(
  nBefore: number,
  nAfter: number,
): ResolutionDescription {
  const nBeforeUpperBound = ruleOfThreeUpperBound(nBefore);
  const nAfterUpperBound = ruleOfThreeUpperBound(nAfter);
  const nBeforeUpperBoundPct = nBeforeUpperBound * 100;
  const nAfterUpperBoundPct = nAfterUpperBound * 100;

  const resolvable =
    nBeforeUpperBound <= RESOLVABLE_UPPER_BOUND_THRESHOLD &&
    nAfterUpperBound <= RESOLVABLE_UPPER_BOUND_THRESHOLD;

  const message = resolvable
    ? `n=${nBefore} trước / n=${nAfter} sau đủ lớn để kết luận: cận trên 95% cho tỷ lệ stall thật ` +
      `là ${nBeforeUpperBoundPct.toFixed(1)}% (trước) và ${nAfterUpperBoundPct.toFixed(1)}% (sau).`
    : `n=${nBefore} trước / n=${nAfter} sau — không thể kết luận được ở cỡ mẫu này: dù quan sát 0 stall, ` +
      `tỷ lệ stall thật vẫn có thể lên tới ${nBeforeUpperBoundPct.toFixed(1)}% (trước) / ` +
      `${nAfterUpperBoundPct.toFixed(1)}% (sau) ở độ tin cậy 95%. Không có phép so sánh thống kê nào ` +
      `phân biệt được "tune có tác dụng" với "chưa từng có stall" ở n này.`;

  return { resolvable, nBeforeUpperBoundPct, nAfterUpperBoundPct, message };
}
