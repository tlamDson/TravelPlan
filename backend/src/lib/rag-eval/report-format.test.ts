import { describe, it, expect } from "vitest";
import { formatReport } from "./report-format";
import type { EvalResult } from "./run-eval";

const m = (mean: number, lo: number, hi: number) => ({
  mean,
  ci95: [lo, hi] as [number, number],
});

const result: EvalResult = {
  schemaVersion: 1,
  runId: "r1",
  gitSha: "abc",
  goldenSha: "g".repeat(64),
  snapshotId: "pi-x",
  n: 2,
  nNoAnswer: 1,
  bootstrap: { B: 200, seed: 42, cluster: "city" },
  settings: {
    global: {
      poolSize: "519",
      random: { "recall@5": m(0.0096, 0.009, 0.01) },
      oracle: { "recall@5": m(1, 1, 1) },
      configs: [
        {
          id: "vector-prod",
          params: {},
          metrics: { "recall@5": m(0.4123, 0.3, 0.5) },
          perQuery: [],
        },
      ],
      deltas: [
        {
          from: "vector-prod",
          to: "hybrid",
          metric: "recall@5",
          diff: 0.05,
          ci95: [0.01, 0.09],
        },
      ],
    },
  },
};

describe("formatReport", () => {
  const text = formatReport(result);

  it("prints N, the no-answer count and the snapshot", () => {
    expect(text).toMatch(/N=2 .*1 no_answer/);
    expect(text).toMatch(/pi-x/);
  });

  it("prints random, oracle and each config with mean and 95% CI to 3 decimals", () => {
    expect(text).toMatch(/random\s.*0\.010 \[0\.009, 0\.010\]/);
    expect(text).toMatch(/oracle\s.*1\.000/);
    expect(text).toMatch(/vector-prod\s.*0\.412 \[0\.300, 0\.500\]/);
  });

  it("prints signed paired deltas", () => {
    expect(text).toMatch(
      /hybrid − vector-prod.*recall@5.*\+0\.050 \[\+0\.010, \+0\.090\]/,
    );
  });
});
