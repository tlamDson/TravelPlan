/**
 * Loads and verifies the committed corpus snapshot. Every check here fails
 * loudly: an eval scored against a silently corrupted or mismatched
 * snapshot produces numbers that look real and aren't.
 */
import fs from "node:fs";
import path from "node:path";
import { toLabel } from "./label";
import { decodeF32, sha256Hex } from "./snapshot-codec";
import {
  SnapshotMetaSchema,
  type SnapshotDoc,
  type SnapshotMeta,
} from "./snapshot-schema";

export const SNAPSHOT_META_FILE = "placeinsights.meta.json";
export const SNAPSHOT_BIN_FILE = "placeinsights.f32";

export interface CorpusSnapshot {
  meta: SnapshotMeta;
  docs: SnapshotDoc[];
  /** Row-major float32 embeddings, `meta.count * meta.dims` long. */
  vectors: Float32Array;
  /** Zero-copy view of one row's embedding. */
  vector(row: number): Float32Array;
  rowOf: Map<string, number>;
}

export function parseSnapshot(metaJson: string, bin: Buffer): CorpusSnapshot {
  const meta = SnapshotMetaSchema.parse(JSON.parse(metaJson));

  if (meta.docs.length !== meta.count) {
    throw new Error(
      `snapshot: docs.length ${meta.docs.length} != count ${meta.count}`,
    );
  }
  const actualSha = sha256Hex(bin);
  if (actualSha !== meta.binSha256) {
    throw new Error(
      `snapshot: binary sha256 ${actualSha} != binSha256 ${meta.binSha256} — re-export or restore the matching ${SNAPSHOT_BIN_FILE}`,
    );
  }

  const rowOf = new Map<string, number>();
  meta.docs.forEach((d, i) => {
    if (d.row !== i) throw new Error(`snapshot: doc ${i} has row ${d.row}`);
    if (d.label !== toLabel(d)) {
      throw new Error(`snapshot: label "${d.label}" != toLabel(doc ${i})`);
    }
    rowOf.set(d.label, i);
  });

  const vectors = decodeF32(bin, meta.dims, meta.count);
  const { dims, count } = meta;

  return {
    meta,
    docs: meta.docs,
    vectors,
    rowOf,
    vector(row: number) {
      if (!Number.isInteger(row) || row < 0 || row >= count) {
        throw new Error(`snapshot: row ${row} out of range 0..${count - 1}`);
      }
      return vectors.subarray(row * dims, (row + 1) * dims);
    },
  };
}

export function loadSnapshot(dir: string): CorpusSnapshot {
  const metaPath = path.join(dir, SNAPSHOT_META_FILE);
  const binPath = path.join(dir, SNAPSHOT_BIN_FILE);
  for (const p of [metaPath, binPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(
        `snapshot: ${path.basename(p)} not found in ${dir} — run npm run eval:export-snapshot -w backend`,
      );
    }
  }
  return parseSnapshot(
    fs.readFileSync(metaPath, "utf8"),
    fs.readFileSync(binPath),
  );
}
