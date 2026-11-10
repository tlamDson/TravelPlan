import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { buildRetrievers, KNOWN_CONFIGS } from "./retriever-registry";
import { emptyRewriteCache, upsertRewrite } from "./rewrite-cache";

const snap = tinySnapshot();

describe("buildRetrievers", () => {
  it("builds the requested configs in the requested order", () => {
    expect(buildRetrievers(snap, ["vector-prod"]).map((r) => r.id)).toEqual([
      "vector-prod",
    ]);
    expect(KNOWN_CONFIGS).toContain("vector-prod");
  });

  it("rejects an unknown config and lists the known ones", () => {
    expect(() => buildRetrievers(snap, ["vector-prod", "colbert"])).toThrow(
      /colbert.*vector-prod/,
    );
  });

  it("registers bm25, hybrid and hybrid-rewrite", () => {
    expect(KNOWN_CONFIGS).toEqual([
      "vector-prod",
      "bm25",
      "hybrid",
      "hybrid-rewrite",
    ]);
  });

  it("refuses hybrid-rewrite without a rewrite cache", () => {
    expect(() => buildRetrievers(snap, ["hybrid-rewrite"])).toThrow(
      /rewrite cache/,
    );
  });

  it("hybrid-rewrite searches BM25 with the cached rewrite and throws on a missing one", () => {
    const rewrites = upsertRewrite(
      emptyRewriteCache("qwen"),
      { id: "q-tokyo-001", text: "sushi" },
      "golden",
    );
    const [r] = buildRetrievers(snap, ["hybrid-rewrite"], { rewrites });
    const q = {
      id: "q-tokyo-001",
      text: "sushi",
      cityIdKey: "tokyo",
      vector: new Float32Array([0, 1]),
    };
    expect(r!.retrieve(q, "city", 1)).toEqual(["tokyo::Golden Gai"]);
    expect(() => r!.retrieve({ ...q, id: "q-tokyo-009" }, "city", 1)).toThrow(
      /missing rewrite/,
    );
  });

  it("rejects an empty or duplicated list", () => {
    expect(() => buildRetrievers(snap, [])).toThrow();
    expect(() => buildRetrievers(snap, ["vector-prod", "vector-prod"])).toThrow(
      /twice/,
    );
  });
});
