import { describe, it, expect } from "vitest";
import {
  encodeF32,
  decodeF32,
  isLosslessF32,
  sha256Hex,
} from "./snapshot-codec";

describe("encodeF32 / decodeF32", () => {
  it("writes rows as little-endian float32, dims*4 bytes per row", () => {
    const buf = encodeF32(
      [
        [1, -2],
        [0.5, 3],
      ],
      2,
    );
    expect(buf.length).toBe(2 * 2 * 4);
    // 1.0f little-endian = 00 00 80 3f
    expect([...buf.subarray(0, 4)]).toEqual([0x00, 0x00, 0x80, 0x3f]);
    expect(buf.readFloatLE(4)).toBe(-2);
  });

  it("round-trips exactly for float32-representable values", () => {
    const rows = [
      [0.25, -1.5, 3],
      [Math.fround(0.1), Math.fround(-0.3), 0],
    ];
    const decoded = decodeF32(encodeF32(rows, 3), 3, 2);
    expect(decoded.length).toBe(6);
    expect(Array.from(decoded)).toEqual(rows.flat());
  });

  it("throws when a row has the wrong number of dims", () => {
    expect(() => encodeF32([[1, 2], [3]], 2)).toThrow(/row 1/);
  });

  it("throws when the buffer length doesn't match count*dims*4", () => {
    expect(() => decodeF32(Buffer.alloc(12), 2, 2)).toThrow(/length/);
  });

  it("decodes a buffer that is not 4-byte aligned in its backing store", () => {
    const backing = Buffer.alloc(9);
    backing.writeFloatLE(7, 1);
    backing.writeFloatLE(-8, 5);
    const unaligned = backing.subarray(1);
    expect(Array.from(decodeF32(unaligned, 2, 1))).toEqual([7, -8]);
  });
});

describe("isLosslessF32", () => {
  it("is true when every value survives Math.fround", () => {
    expect(isLosslessF32([[0.5, 1], [Math.fround(0.1)]])).toBe(true);
  });

  it("is false when any value needs more than float32 precision", () => {
    expect(isLosslessF32([[0.5], [0.1]])).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("hashes bytes to lowercase hex", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
