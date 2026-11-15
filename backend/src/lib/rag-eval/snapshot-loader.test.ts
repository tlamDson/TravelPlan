import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSnapshot, type RawInsightDoc } from "./snapshot-builder";
import {
  parseSnapshot,
  loadSnapshot,
  SNAPSHOT_META_FILE,
  SNAPSHOT_BIN_FILE,
} from "./snapshot-loader";

function doc(
  cityIdKey: string,
  name: string,
  embedding: number[],
): RawInsightDoc {
  return {
    cityIdKey,
    countryIdKey: "xx",
    name,
    category: "nature",
    description: "d",
    tags: [],
    sourceQuery: "nature",
    embedding,
  };
}

const built = buildSnapshot(
  [doc("tokyo", "B", [0.5, 0.25]), doc("hanoi", "A", [-1, 2])],
  {
    exportedAt: new Date("2026-11-12T00:00:00.000Z"),
    sourceDb: "travelplan_staging",
    embeddingModel: "gemini-embedding-001",
  },
);
const metaJson = JSON.stringify(built.meta);

describe("parseSnapshot", () => {
  it("returns docs, a per-row vector accessor and a label index", () => {
    const snap = parseSnapshot(metaJson, built.bin);
    expect(snap.docs.map((d) => d.label)).toEqual(["hanoi::A", "tokyo::B"]);
    expect(Array.from(snap.vector(1))).toEqual([0.5, 0.25]);
    expect(snap.rowOf.get("hanoi::A")).toBe(0);
  });

  it("throws when the binary's sha256 doesn't match binSha256", () => {
    const tampered = Buffer.from(built.bin);
    tampered.writeFloatLE(9, 0);
    expect(() => parseSnapshot(metaJson, tampered)).toThrow(/binSha256/);
  });

  it("throws when the metadata fails schema validation", () => {
    const bad = JSON.stringify({ ...built.meta, dims: "two" });
    expect(() => parseSnapshot(bad, built.bin)).toThrow();
  });

  it("throws when docs.length disagrees with count", () => {
    const bad = JSON.stringify({ ...built.meta, count: 3 });
    expect(() => parseSnapshot(bad, built.bin)).toThrow(/count/);
  });

  it("throws when a doc's label wasn't produced by toLabel()", () => {
    const docs = built.meta.docs.map((d, i) =>
      i === 0 ? { ...d, label: "hanoi::Z" } : d,
    );
    const bad = JSON.stringify({ ...built.meta, docs });
    expect(() => parseSnapshot(bad, built.bin)).toThrow(/label/);
  });

  it("throws when rows are not 0..count-1 in order", () => {
    const docs = built.meta.docs.map((d, i) => ({ ...d, row: 1 - i }));
    const bad = JSON.stringify({ ...built.meta, docs });
    expect(() => parseSnapshot(bad, built.bin)).toThrow(/row/);
  });

  it("rejects an out-of-range row in vector()", () => {
    const snap = parseSnapshot(metaJson, built.bin);
    expect(() => snap.vector(2)).toThrow(/row/);
  });
});

describe("loadSnapshot", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-snapshot-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads the meta + binary pair from a directory", () => {
    fs.writeFileSync(path.join(dir, SNAPSHOT_META_FILE), metaJson);
    fs.writeFileSync(path.join(dir, SNAPSHOT_BIN_FILE), built.bin);
    expect(loadSnapshot(dir).meta.snapshotId).toBe(built.meta.snapshotId);
  });

  it("names the missing file when the snapshot hasn't been exported yet", () => {
    expect(() => loadSnapshot(dir)).toThrow(/placeinsights\.meta\.json/);
  });
});
