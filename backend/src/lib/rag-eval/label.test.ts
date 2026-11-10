import { describe, it, expect } from "vitest";
import { toLabel, parseLabel } from "./label";

describe("toLabel", () => {
  it("joins cityIdKey and name with '::'", () => {
    expect(toLabel({ cityIdKey: "tokyo", name: "Golden Gai" })).toBe(
      "tokyo::Golden Gai",
    );
  });

  it("rejects an empty cityIdKey or name", () => {
    expect(() => toLabel({ cityIdKey: "", name: "X" })).toThrow();
    expect(() => toLabel({ cityIdKey: "tokyo", name: "" })).toThrow();
  });

  it("rejects a cityIdKey containing the separator (would make parsing ambiguous)", () => {
    expect(() => toLabel({ cityIdKey: "a::b", name: "X" })).toThrow();
  });
});

describe("parseLabel", () => {
  it("round-trips with toLabel", () => {
    const parts = { cityIdKey: "hanoi", name: "Bún Chả Hương Liên" };
    expect(parseLabel(toLabel(parts))).toEqual(parts);
  });

  it("keeps '::' inside the name (split on the first separator only)", () => {
    const parts = { cityIdKey: "paris", name: "Le Bar :: Rive Gauche" };
    expect(parseLabel(toLabel(parts))).toEqual(parts);
  });

  it("throws on a string with no separator", () => {
    expect(() => parseLabel("tokyo-golden-gai")).toThrow();
  });
});
