import { describe, it, expect } from "vitest";
import { tokenize, insightText } from "./tokenize";

describe("tokenize", () => {
  it("lowercases and splits on anything that isn't a letter or digit", () => {
    expect(tokenize("Tsukiji Outer-Market, 24h!")).toEqual([
      "tsukiji",
      "outer",
      "market",
      "24h",
    ]);
  });

  it("strips diacritics so Vietnamese and French names match unaccented queries", () => {
    expect(tokenize("Bún Chả Hương Liên")).toEqual([
      "bun",
      "cha",
      "huong",
      "lien",
    ]);
    // stopwords are English-only on purpose — "de" stays
    expect(tokenize("Café de Flore")).toEqual(["cafe", "de", "flore"]);
  });

  it("maps đ to d (it has no combining-mark decomposition)", () => {
    expect(tokenize("Phở Đặc Biệt")).toEqual(["pho", "dac", "biet"]);
  });

  it("drops English stopwords but keeps every content word", () => {
    expect(tokenize("the best bars in an old alley")).toEqual([
      "best",
      "bars",
      "old",
      "alley",
    ]);
  });

  it("returns [] for empty or punctuation-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(" — !! ")).toEqual([]);
  });
});

describe("insightText", () => {
  it("concatenates name, category, tags and description — the one text BM25 indexes", () => {
    expect(
      insightText({
        name: "Golden Gai",
        category: "nightlife",
        tags: ["bars", "shinjuku"],
        description: "Tiny bars.",
      }),
    ).toBe("Golden Gai nightlife bars shinjuku Tiny bars.");
  });
});
