import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { createBm25Retriever, createHybridRetriever } from "./hybrid-retriever";

const snap = tinySnapshot();
// tokyo docs: Golden Gai [1,0], Tsukiji Outer Market [0,1]
const q = (text: string, vector: number[]) => ({
  id: "q-tokyo-001",
  text,
  cityIdKey: "tokyo",
  vector: new Float32Array(vector),
});

describe("createBm25Retriever", () => {
  const r = createBm25Retriever(snap);

  it("ranks by BM25 over the doc text and ignores the vector", () => {
    expect(r.retrieve(q("tsukiji market", [1, 0]), "global", 5)).toEqual([
      "tokyo::Tsukiji Outer Market",
    ]);
  });

  it("returns only docs that share a term with the query", () => {
    expect(r.retrieve(q("sushi omakase", [1, 0]), "global", 5)).toEqual([]);
  });

  it("respects the city setting", () => {
    // "lake" only matches Hoan Kiem Lake, which is in hanoi
    expect(r.retrieve(q("lake", [1, 0]), "city", 5)).toEqual([]);
    expect(r.retrieve(q("lake", [1, 0]), "global", 5)).toEqual([
      "hanoi::Hoan Kiem Lake",
    ]);
  });
});

describe("createHybridRetriever", () => {
  it("fuses dense and BM25 rankings with RRF", () => {
    // dense (city): [Tsukiji, Golden Gai]; bm25: [Golden Gai]
    // RRF k=60: Golden Gai 1/62 + 1/61 > Tsukiji 1/61
    const r = createHybridRetriever(snap);
    expect(r.retrieve(q("golden", [0, 1]), "city", 2)).toEqual([
      "tokyo::Golden Gai",
      "tokyo::Tsukiji Outer Market",
    ]);
  });

  it("degrades to the dense ranking when BM25 matches nothing", () => {
    const r = createHybridRetriever(snap);
    expect(r.retrieve(q("sushi", [0, 1]), "city", 2)).toEqual([
      "tokyo::Tsukiji Outer Market",
      "tokyo::Golden Gai",
    ]);
  });

  it("feeds BM25 a different text when given a query-text function (rewrite)", () => {
    const r = createHybridRetriever(snap, {
      id: "hybrid-rewrite",
      bm25Text: () => "golden",
    });
    expect(r.id).toBe("hybrid-rewrite");
    expect(r.retrieve(q("sushi", [0, 1]), "city", 1)).toEqual([
      "tokyo::Golden Gai",
    ]);
  });

  it("records its fixed parameters", () => {
    expect(createHybridRetriever(snap).params).toMatchObject({
      rrfK: 60,
      candidateDepth: 50,
      k1: 1.2,
      b: 0.75,
    });
  });
});
