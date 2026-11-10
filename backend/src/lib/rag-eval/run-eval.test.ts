import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { runEval } from "./run-eval";
import { createVectorRetriever } from "./vector-retriever";
import {
  buildQueryEmbeddingCache,
  parseQueryEmbeddingCache,
} from "./query-embedding-cache";
import type { GoldenItem, GoldenSet } from "./golden-schema";

const snap = tinySnapshot();

function item(over: Partial<GoldenItem>): GoldenItem {
  return {
    id: "q-tokyo-001",
    cityIdKey: "tokyo",
    countryIdKey: "jp",
    query: "bars",
    queryType: "specific",
    source: "human",
    preferences: null,
    labels: { "tokyo::Golden Gai": 2 },
    exhaustive: true,
    labeledAt: "2026-11-12",
    notes: "",
    ...over,
  };
}

const golden: GoldenSet = {
  version: 1,
  snapshotId: snap.meta.snapshotId,
  labeler: "lam",
  gradeScale: {},
  folds: { tokyo: 0, hanoi: 1 },
  items: [
    // "bars" → [1, 0.2]: Golden Gai is #1 globally and in tokyo
    item({}),
    // "lake walk" → [1, 0]: Golden Gai is #1, the relevant Hoan Kiem Lake is last
    item({
      id: "q-hanoi-001",
      cityIdKey: "hanoi",
      countryIdKey: "vn",
      query: "lake walk",
      labels: { "hanoi::Hoan Kiem Lake": 2 },
    }),
    item({
      id: "q-tokyo-002",
      query: "ski resort",
      queryType: "no_answer",
      labels: {},
    }),
  ],
};

const { indexJson, bin } = buildQueryEmbeddingCache(
  "gemini-embedding-001",
  2,
  new Map([
    ["bars", [1, 0.2]],
    ["lake walk", [1, 0]],
    ["ski resort", [0, 0]],
  ]),
);
const queries = parseQueryEmbeddingCache(indexJson, bin);

const base = {
  golden,
  snapshot: snap,
  queries,
  retrievers: [createVectorRetriever(snap)],
  settings: ["global", "city"] as const,
  ks: [1, 3],
  bootstrap: { B: 200, seed: 42 },
  runId: "test",
  gitSha: "abc",
};

describe("runEval", () => {
  const res = runEval({ ...base, settings: [...base.settings] });

  it("excludes no_answer items from N and counts them separately", () => {
    expect(res.n).toBe(2);
    expect(res.nNoAnswer).toBe(1);
    expect(res.snapshotId).toBe(snap.meta.snapshotId);
    expect(res.goldenSha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("scores the vector retriever per query and averages", () => {
    const vec = res.settings.global!.configs[0]!;
    expect(vec.id).toBe("vector-prod");
    // tokyo query: hit at rank 1; hanoi query: relevant doc ranks 4/4 globally
    expect(vec.metrics["recall@1"]!.mean).toBe(0.5);
    expect(vec.metrics["mrr"]!.mean).toBeCloseTo((1 + 1 / 4) / 2);
    expect(vec.perQuery.map((p) => p.id)).toEqual([
      "q-tokyo-001",
      "q-hanoi-001",
    ]);
    expect(vec.perQuery[0]!.top[0]).toBe("tokyo::Golden Gai");
  });

  it("restricts candidates to the query's city in the city setting", () => {
    const vec = res.settings.city!.configs[0]!;
    // hanoi pool is [Bun Cha, Hoan Kiem]; [1,0] puts Hoan Kiem 2nd
    expect(vec.metrics["mrr"]!.mean).toBeCloseTo((1 + 1 / 2) / 2);
  });

  it("reports random and oracle baselines from the setting's pool size", () => {
    // city pools have 2 docs, |R| = 1 → random recall@1 = 1/2
    expect(res.settings.city!.random["recall@1"]!.mean).toBeCloseTo(0.5);
    // global pool has 4 docs → 1/4
    expect(res.settings.global!.random["recall@1"]!.mean).toBeCloseTo(0.25);
    expect(res.settings.global!.oracle["recall@1"]!.mean).toBe(1);
  });

  it("emits paired deltas of every config against the first", () => {
    const twice = runEval({
      ...base,
      settings: ["global"],
      retrievers: [
        createVectorRetriever(snap),
        { ...createVectorRetriever(snap), id: "copy" },
      ],
    });
    const d = twice.settings.global!.deltas.find(
      (x) => x.metric === "recall@1",
    )!;
    expect(d).toMatchObject({
      from: "vector-prod",
      to: "copy",
      diff: 0,
      ci95: [0, 0],
    });
  });

  it("refuses to run on an invalid golden set", () => {
    const bad = { ...golden, items: [item({ labeledAt: null })] };
    expect(() =>
      runEval({ ...base, settings: ["global"], golden: bad }),
    ).toThrow(/not labeled/);
  });

  it("throws when a query has no cached embedding", () => {
    const g = { ...golden, items: [item({ query: "museums" })] };
    expect(() => runEval({ ...base, settings: ["global"], golden: g })).toThrow(
      /missing query embedding/,
    );
  });
});
