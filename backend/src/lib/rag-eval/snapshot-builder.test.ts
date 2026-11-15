import { describe, it, expect } from "vitest";
import { buildSnapshot, type RawInsightDoc } from "./snapshot-builder";
import { decodeF32, sha256Hex } from "./snapshot-codec";

function doc(
  cityIdKey: string,
  name: string,
  embedding: number[],
): RawInsightDoc {
  return {
    cityIdKey,
    countryIdKey: "xx",
    name,
    category: "food",
    description: `${name} description`,
    tags: ["t"],
    sourceQuery: "food",
    embedding,
  };
}

const OPTS = {
  exportedAt: new Date("2026-11-12T08:00:00.000Z"),
  sourceDb: "travelplan_staging",
  embeddingModel: "gemini-embedding-001",
};

describe("buildSnapshot", () => {
  it("orders docs by label so re-exports of the same corpus are byte-identical", () => {
    const a = buildSnapshot(
      [doc("tokyo", "B", [1, 0]), doc("hanoi", "A", [0, 1])],
      OPTS,
    );
    const b = buildSnapshot(
      [doc("hanoi", "A", [0, 1]), doc("tokyo", "B", [1, 0])],
      OPTS,
    );
    expect(a.meta.docs.map((d) => d.label)).toEqual(["hanoi::A", "tokyo::B"]);
    expect(a.meta.docs.map((d) => d.row)).toEqual([0, 1]);
    expect(a.bin.equals(b.bin)).toBe(true);
    expect(a.meta.binSha256).toBe(b.meta.binSha256);
  });

  it("writes row i of the binary as the embedding of docs[i]", () => {
    const { meta, bin } = buildSnapshot(
      [doc("tokyo", "B", [0.5, 0.25]), doc("hanoi", "A", [-1, 2])],
      OPTS,
    );
    const flat = decodeF32(bin, meta.dims, meta.count);
    expect(Array.from(flat.subarray(0, 2))).toEqual([-1, 2]); // hanoi::A
    expect(Array.from(flat.subarray(2, 4))).toEqual([0.5, 0.25]); // tokyo::B
  });

  it("records dims, count, dtype, binSha256 and a dated snapshotId", () => {
    const { meta, bin } = buildSnapshot([doc("tokyo", "A", [1, 2, 3])], OPTS);
    expect(meta.dims).toBe(3);
    expect(meta.count).toBe(1);
    expect(meta.dtype).toBe("float32-le");
    expect(meta.binSha256).toBe(sha256Hex(bin));
    expect(meta.snapshotId).toBe(`pi-20261112-${meta.binSha256.slice(0, 8)}`);
    expect(meta.exportedAt).toBe("2026-11-12T08:00:00.000Z");
    expect(meta.sourceDb).toBe("travelplan_staging");
  });

  it("flags lossless=false when an embedding value doesn't fit float32", () => {
    expect(buildSnapshot([doc("tokyo", "A", [0.5])], OPTS).meta.lossless).toBe(
      true,
    );
    expect(buildSnapshot([doc("tokyo", "A", [0.1])], OPTS).meta.lossless).toBe(
      false,
    );
  });

  it("never copies the embedding or a Mongo _id into the metadata", () => {
    const raw = {
      ...doc("tokyo", "A", [1]),
      _id: "65f0c0ffee",
    } as RawInsightDoc;
    const { meta } = buildSnapshot([raw], OPTS);
    expect(meta.docs[0]).not.toHaveProperty("embedding");
    expect(meta.docs[0]).not.toHaveProperty("_id");
  });

  it("throws on an empty corpus", () => {
    expect(() => buildSnapshot([], OPTS)).toThrow(/empty/);
  });

  it("throws when docs disagree on embedding dims, naming the offender", () => {
    expect(() =>
      buildSnapshot([doc("hanoi", "A", [1, 2]), doc("tokyo", "B", [1])], OPTS),
    ).toThrow(/tokyo::B/);
  });

  it("throws on duplicate labels (the corpus's unique index should prevent this)", () => {
    expect(() =>
      buildSnapshot([doc("tokyo", "A", [1]), doc("tokyo", "A", [2])], OPTS),
    ).toThrow(/duplicate/i);
  });
});
