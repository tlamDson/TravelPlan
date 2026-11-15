import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import {
  makeFolds,
  initGoldenSet,
  parseDraftLine,
  importDrafts,
  parseGradeInput,
  applyGrades,
  cityDocs,
} from "./golden-labeling";
import { validateGoldenSet } from "./golden-validate";

const snap = tinySnapshot();

describe("makeFolds", () => {
  it("assigns sorted cities round-robin so the split never depends on input order", () => {
    const a = makeFolds(["f", "a", "c", "b", "e", "d", "g"], 5);
    expect(a).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4, f: 0, g: 1 });
    expect(makeFolds(["g", "a", "b", "c", "d", "e", "f"], 5)).toEqual(a);
  });
});

describe("initGoldenSet", () => {
  it("pins the snapshotId and folds every snapshot city", () => {
    const g = initGoldenSet(snap, "lam");
    expect(g.snapshotId).toBe(snap.meta.snapshotId);
    expect(g.folds).toEqual({ hanoi: 0, tokyo: 1 });
    expect(g.items).toEqual([]);
  });
});

describe("parseDraftLine", () => {
  it("defaults queryType to specific and source to human", () => {
    expect(
      parseDraftLine('{"cityIdKey":"tokyo","query":"bars"}'),
    ).toMatchObject({
      cityIdKey: "tokyo",
      query: "bars",
      queryType: "specific",
      source: "human",
    });
  });

  it("throws on a line without a query", () => {
    expect(() => parseDraftLine('{"cityIdKey":"tokyo"}')).toThrow();
  });
});

describe("importDrafts", () => {
  it("adds unlabeled items with per-city sequential ids and the snapshot's countryIdKey", () => {
    const g = initGoldenSet(snap, "lam");
    const { golden, added } = importDrafts(
      g,
      [
        parseDraftLine('{"cityIdKey":"tokyo","query":"bars"}'),
        parseDraftLine('{"cityIdKey":"tokyo","query":"fish market"}'),
        parseDraftLine('{"cityIdKey":"hanoi","query":"noodles"}'),
      ],
      snap,
    );
    expect(added).toBe(3);
    expect(golden.items.map((i) => i.id)).toEqual([
      "q-tokyo-001",
      "q-tokyo-002",
      "q-hanoi-001",
    ]);
    expect(golden.items[2]).toMatchObject({
      countryIdKey: "vn",
      labels: {},
      labeledAt: null,
    });
    expect(validateGoldenSet(golden, snap, { allowUnlabeled: true })).toEqual(
      [],
    );
  });

  it("skips a query already present for the same city (re-import is idempotent)", () => {
    const d = [parseDraftLine('{"cityIdKey":"tokyo","query":"bars"}')];
    const once = importDrafts(initGoldenSet(snap, "lam"), d, snap).golden;
    const twice = importDrafts(once, d, snap);
    expect(twice.added).toBe(0);
    expect(twice.skipped).toBe(1);
    expect(twice.golden.items).toHaveLength(1);
  });

  it("throws on a city the snapshot doesn't have", () => {
    expect(() =>
      importDrafts(
        initGoldenSet(snap, "lam"),
        [parseDraftLine('{"cityIdKey":"paris","query":"x"}')],
        snap,
      ),
    ).toThrow(/paris/);
  });
});

describe("parseGradeInput", () => {
  it("parses 1-based 'index:grade' tokens separated by spaces or commas", () => {
    expect(parseGradeInput("1:2, 3:1", 4)).toEqual(
      new Map([
        [1, 2],
        [3, 1],
      ]),
    );
  });

  it("treats 'none' or blank as no relevant docs", () => {
    expect(parseGradeInput("none", 4).size).toBe(0);
    expect(parseGradeInput("  ", 4).size).toBe(0);
  });

  it("rejects out-of-range indexes, bad grades, bare indexes and duplicates", () => {
    expect(() => parseGradeInput("5:2", 4)).toThrow(/range/);
    expect(() => parseGradeInput("1:3", 4)).toThrow(/grade/);
    expect(() => parseGradeInput("1", 4)).toThrow(/index:grade/);
    expect(() => parseGradeInput("1:2 1:1", 4)).toThrow(/twice/);
  });
});

describe("applyGrades", () => {
  const draft = importDrafts(
    initGoldenSet(snap, "lam"),
    [
      parseDraftLine(
        '{"cityIdKey":"tokyo","query":"bars","queryType":"thematic"}',
      ),
    ],
    snap,
  ).golden.items[0]!;
  const docs = cityDocs(snap, "tokyo");

  it("maps 1-based indexes onto the city's docs as toLabel keys", () => {
    expect(docs.map((d) => d.name)).toEqual([
      "Golden Gai",
      "Tsukiji Outer Market",
    ]);
    const labeled = applyGrades(draft, docs, new Map([[1, 2]]), "2026-11-12");
    expect(labeled).toMatchObject({
      labels: { "tokyo::Golden Gai": 2 },
      exhaustive: true,
      labeledAt: "2026-11-12",
      queryType: "thematic",
    });
  });

  it("turns an item with no relevant doc into no_answer and keeps the original type in notes", () => {
    const labeled = applyGrades(draft, docs, new Map(), "2026-11-12");
    expect(labeled.queryType).toBe("no_answer");
    expect(labeled.labels).toEqual({});
    expect(labeled.notes).toMatch(/thematic/);
  });
});
