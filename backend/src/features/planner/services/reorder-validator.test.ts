import { describe, it, expect } from "vitest";
import { validateReorderIds } from "./reorder-validator";

describe("validateReorderIds", () => {
  const current = ["a", "b", "c"];

  it("accepts the same order", () => {
    expect(validateReorderIds(current, ["a", "b", "c"])).toEqual({ ok: true });
  });

  it("accepts any permutation", () => {
    expect(validateReorderIds(current, ["c", "a", "b"])).toEqual({ ok: true });
  });

  it("rejects a subset (would delete activities)", () => {
    const r = validateReorderIds(current, ["a"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/every activity/i);
  });

  it("rejects duplicates with the right length (would duplicate and delete)", () => {
    const r = validateReorderIds(current, ["a", "a", "c"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/duplicate/i);
  });

  it("rejects extra ids", () => {
    const r = validateReorderIds(current, ["a", "b", "c", "d"]);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown id of the right length and names it", () => {
    const r = validateReorderIds(current, ["a", "b", "zzz"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("zzz");
  });

  it("rejects non-string ids", () => {
    expect(validateReorderIds(current, ["a", 1, "c"]).ok).toBe(false);
  });
});
