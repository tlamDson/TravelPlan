/**
 * Pure: turns raw PlaceInsight documents (as read from Mongo with
 * `+embedding`) into the snapshot pair — metadata + float32 binary. The
 * export script only does I/O around this, so everything that decides
 * what the snapshot contains is unit-tested here.
 */
import { toLabel } from "./label";
import { encodeF32, isLosslessF32, sha256Hex } from "./snapshot-codec";
import type { SnapshotDoc, SnapshotMeta } from "./snapshot-schema";

export interface RawInsightDoc {
  cityIdKey: string;
  countryIdKey: string;
  name: string;
  category: string;
  description: string;
  tags?: string[] | undefined;
  sourceQuery: string;
  embedding: number[];
}

export interface BuildSnapshotOpts {
  exportedAt: Date;
  sourceDb: string;
  embeddingModel: string;
}

export interface BuiltSnapshot {
  meta: SnapshotMeta;
  bin: Buffer;
}

function compareLabels(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildSnapshot(
  raw: RawInsightDoc[],
  opts: BuildSnapshotOpts,
): BuiltSnapshot {
  if (raw.length === 0) throw new Error("buildSnapshot: corpus is empty");

  // Code-unit order (not localeCompare) so the result is identical on
  // every machine regardless of ICU/locale.
  const labelled = raw
    .map((d) => ({ d, label: toLabel(d) }))
    .sort((x, y) => compareLabels(x.label, y.label));

  const dims = labelled[0]!.d.embedding.length;
  const seen = new Set<string>();
  for (const { d, label } of labelled) {
    if (seen.has(label))
      throw new Error(`buildSnapshot: duplicate label ${label}`);
    seen.add(label);
    if (d.embedding.length !== dims) {
      throw new Error(
        `buildSnapshot: ${label} has ${d.embedding.length} dims, expected ${dims}`,
      );
    }
  }

  const rows = labelled.map(({ d }) => d.embedding);
  const bin = encodeF32(rows, dims);
  const binSha256 = sha256Hex(bin);
  const day = opts.exportedAt.toISOString().slice(0, 10).replace(/-/g, "");

  const docs: SnapshotDoc[] = labelled.map(({ d, label }, row) => ({
    row,
    label,
    cityIdKey: d.cityIdKey,
    countryIdKey: d.countryIdKey,
    name: d.name,
    category: d.category,
    description: d.description,
    tags: d.tags ?? [],
    sourceQuery: d.sourceQuery,
  }));

  return {
    bin,
    meta: {
      snapshotId: `pi-${day}-${binSha256.slice(0, 8)}`,
      exportedAt: opts.exportedAt.toISOString(),
      sourceDb: opts.sourceDb,
      embeddingModel: opts.embeddingModel,
      dims,
      dtype: "float32-le",
      count: docs.length,
      lossless: isLosslessF32(rows),
      binSha256,
      docs,
    },
  };
}
