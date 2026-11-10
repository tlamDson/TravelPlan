import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { cosine, createVectorRetriever } from "./vector-retriever";
import { candidateRows } from "./retriever";

const snap = tinySnapshot();
// Row order (sorted by label): 0 hanoi::Bun Cha Huong Lien [0.5,0.5]
// 1 hanoi::Hoan Kiem Lake [-1,0]  2 tokyo::Golden Gai [1,0]
// 3 tokyo::Tsukiji Outer Market [0,1]

describe("cosine", () => {
  it("matches the hand-computed value", () => {
    // (1*1 + 2*0) / (sqrt(5) * 1)
    expect(
      cosine(new Float32Array([1, 2]), new Float32Array([1, 0])),
    ).toBeCloseTo(1 / Math.sqrt(5));
  });

  it("is scale-invariant and 0 for a zero vector", () => {
    expect(
      cosine(new Float32Array([3, 0]), new Float32Array([1, 0])),
    ).toBeCloseTo(1);
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 0]))).toBe(0);
  });
});

describe("candidateRows", () => {
  it("is every doc in the global setting and only the city's docs in the city setting", () => {
    expect(candidateRows(snap, "global", "tokyo")).toEqual([0, 1, 2, 3]);
    expect(candidateRows(snap, "city", "tokyo")).toEqual([2, 3]);
  });
});

describe("createVectorRetriever", () => {
  const r = createVectorRetriever(snap);
  const q = (vector: number[]) => ({
    id: "q-tokyo-001",
    text: "x",
    cityIdKey: "tokyo",
    vector: new Float32Array(vector),
  });

  it("ranks by cosine across the whole corpus in the global setting", () => {
    // query [1, 0.2]: Golden Gai .98, Bun Cha .83, Tsukiji .20, Hoan Kiem -.98
    expect(r.retrieve(q([1, 0.2]), "global", 4)).toEqual([
      "tokyo::Golden Gai",
      "hanoi::Bun Cha Huong Lien",
      "tokyo::Tsukiji Outer Market",
      "hanoi::Hoan Kiem Lake",
    ]);
  });

  it("only returns the query's city in the city setting, and truncates to k", () => {
    expect(r.retrieve(q([0, 1]), "city", 1)).toEqual([
      "tokyo::Tsukiji Outer Market",
    ]);
  });

  it("breaks score ties by snapshot row so results are deterministic", () => {
    // [1,1] is equidistant from Golden Gai [1,0] and Tsukiji [0,1]
    expect(r.retrieve(q([1, 1]), "city", 2)).toEqual([
      "tokyo::Golden Gai",
      "tokyo::Tsukiji Outer Market",
    ]);
  });

  it("rejects a query vector with the wrong dims", () => {
    expect(() => r.retrieve(q([1, 0, 0]), "global", 2)).toThrow(/dims/);
  });
});
