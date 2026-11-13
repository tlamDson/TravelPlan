import { describe, it, expect } from "vitest";
import { getCountryImage } from "../countryImage";

describe("getCountryImage", () => {
  it("returns a France image for a French destination", () => {
    expect(getCountryImage("Paris, France", "trip-1")).toMatch(
      /^\/images\/countries\/france_/,
    );
  });

  it("returns a Vietnam image for a Vietnamese city", () => {
    expect(getCountryImage("Hanoi, Vietnam", "trip-2")).toMatch(
      /^\/images\/countries\/vietnam_/,
    );
  });

  it("returns a US image for a US destination", () => {
    expect(getCountryImage("Chicago, United States", "trip-3")).toMatch(
      /^\/images\/countries\/america_/,
    );
  });

  it("returns null for Japan (a country with no images), never another country's landmark", () => {
    for (const seed of ["a", "b", "c", "trip-4", "665f1c2e9b1d"]) {
      expect(getCountryImage("Tokyo, Japan", seed)).toBeNull();
    }
    expect(getCountryImage("Tokyo, Japan")).toBeNull();
  });

  it("returns null for another country with no images", () => {
    expect(getCountryImage("Reykjavik, Iceland", "trip-5")).toBeNull();
  });

  it("returns null when the destination is missing", () => {
    expect(getCountryImage(undefined, "trip-6")).toBeNull();
    expect(getCountryImage(null, "trip-6")).toBeNull();
    expect(getCountryImage("", "trip-6")).toBeNull();
  });

  it("does not match keywords inside longer words", () => {
    // "usa" in Busan, "nice" in Venice
    expect(getCountryImage("Busan, South Korea", "trip-7")).toBeNull();
    expect(getCountryImage("Venice, Italy", "trip-8")).toBeNull();
  });

  it("is deterministic for the same seed", () => {
    expect(getCountryImage("Paris, France", "same")).toBe(
      getCountryImage("Paris, France", "same"),
    );
  });
});
