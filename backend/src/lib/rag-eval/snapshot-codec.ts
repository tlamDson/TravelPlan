/**
 * Binary codec for the offline RAG corpus snapshot: one row per doc, each
 * row exactly `dims` float32 values, little-endian, no header. Raw float32
 * (not float16/int8) so the offline eval scores the exact vectors Atlas
 * holds — see docs/implementation/b3-data-formats.md §2.
 */
import { createHash } from "node:crypto";

const BYTES = 4;

export function encodeF32(rows: number[][], dims: number): Buffer {
  const buf = Buffer.alloc(rows.length * dims * BYTES);
  rows.forEach((row, r) => {
    if (row.length !== dims) {
      throw new Error(
        `encodeF32: row ${r} has ${row.length} dims, expected ${dims}`,
      );
    }
    row.forEach((v, c) => buf.writeFloatLE(v, (r * dims + c) * BYTES));
  });
  return buf;
}

/** Returns one flat Float32Array (row-major). Copies through readFloatLE
 * rather than viewing the buffer, so it works regardless of the buffer's
 * byte offset alignment and host endianness. */
export function decodeF32(
  buf: Buffer,
  dims: number,
  count: number,
): Float32Array {
  const expected = dims * count * BYTES;
  if (buf.length !== expected) {
    throw new Error(
      `decodeF32: buffer length ${buf.length} != count*dims*4 = ${expected}`,
    );
  }
  const out = new Float32Array(dims * count);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * BYTES);
  return out;
}

/** True when every value is exactly representable as float32 — i.e. the
 * binary snapshot loses nothing relative to the stored doubles. */
export function isLosslessF32(rows: number[][]): boolean {
  return rows.every((row) => row.every((v) => Math.fround(v) === v));
}

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}
