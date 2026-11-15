import { describe, it, expect } from "vitest";
import {
  queryKey,
  buildQueryEmbeddingCache,
  parseQueryEmbeddingCache,
  mergeQueryEmbeddings,
  missingTexts,
} from "./query-embedding-cache";
import { sha256Hex } from "./snapshot-codec";

const MODEL = "gemini-embedding-001";

function built(entries: [string, number[]][]) {
  return buildQueryEmbeddingCache(MODEL, 2, new Map(entries));
}

describe("queryKey", () => {
  it("is the sha256 of the exact query text", () => {
    expect(queryKey("bars")).toBe(sha256Hex("bars"));
    expect(queryKey("bars ")).not.toBe(queryKey("bars"));
  });
});

describe("build / parse", () => {
  it("round-trips embeddings keyed by query text", () => {
    const { indexJson, bin } = built([
      ["bars", [1, 0]],
      ["noodles", [0.5, -0.25]],
    ]);
    const cache = parseQueryEmbeddingCache(indexJson, bin);
    expect(Array.from(cache.get("noodles"))).toEqual([0.5, -0.25]);
    expect(cache.has("bars")).toBe(true);
    expect(cache.model).toBe(MODEL);
  });

  it("is byte-identical regardless of insertion order", () => {
    const a = built([
      ["bars", [1, 0]],
      ["noodles", [0, 1]],
    ]);
    const b = built([
      ["noodles", [0, 1]],
      ["bars", [1, 0]],
    ]);
    expect(a.bin.equals(b.bin)).toBe(true);
    expect(a.indexJson).toBe(b.indexJson);
  });

  it("throws on a missing entry instead of silently skipping the query", () => {
    const { indexJson, bin } = built([["bars", [1, 0]]]);
    const cache = parseQueryEmbeddingCache(indexJson, bin);
    expect(() => cache.get("museums")).toThrow(
      /missing query embedding.*museums/,
    );
  });

  it("throws when the binary doesn't match the index's sha256", () => {
    const { indexJson, bin } = built([["bars", [1, 0]]]);
    const tampered = Buffer.from(bin);
    tampered.writeFloatLE(3, 0);
    expect(() => parseQueryEmbeddingCache(indexJson, tampered)).toThrow(
      /sha256/,
    );
  });

  it("rejects an embedding with the wrong dims", () => {
    expect(() => built([["bars", [1, 0, 0]]])).toThrow(/dims/);
  });
});

describe("mergeQueryEmbeddings", () => {
  it("keeps existing vectors and adds new ones", () => {
    const first = built([["bars", [1, 0]]]);
    const existing = parseQueryEmbeddingCache(first.indexJson, first.bin);
    const merged = mergeQueryEmbeddings(
      existing,
      MODEL,
      2,
      new Map([["noodles", [0, 1]]]),
    );
    const cache = parseQueryEmbeddingCache(merged.indexJson, merged.bin);
    expect(Array.from(cache.get("bars"))).toEqual([1, 0]);
    expect(Array.from(cache.get("noodles"))).toEqual([0, 1]);
  });

  it("refuses to mix vectors from a different embedding model", () => {
    const first = built([["bars", [1, 0]]]);
    const existing = parseQueryEmbeddingCache(first.indexJson, first.bin);
    expect(() =>
      mergeQueryEmbeddings(existing, "text-embedding-004", 2, new Map()),
    ).toThrow(/model/);
  });
});

describe("missingTexts", () => {
  it("returns unique texts not yet cached (all of them when there is no cache)", () => {
    const { indexJson, bin } = built([["bars", [1, 0]]]);
    const cache = parseQueryEmbeddingCache(indexJson, bin);
    expect(missingTexts(cache, ["bars", "noodles", "noodles"])).toEqual([
      "noodles",
    ]);
    expect(missingTexts(null, ["a", "a", "b"])).toEqual(["a", "b"]);
  });
});
