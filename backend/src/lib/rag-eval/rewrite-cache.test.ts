import { describe, it, expect } from "vitest";
import {
  parseRewriteCache,
  emptyRewriteCache,
  upsertRewrite,
  getRewrite,
  serializeRewriteCache,
  parseRewriteOutput,
  REWRITE_PROMPT_SHA,
} from "./rewrite-cache";

const q = { id: "q-tokyo-001", text: "where to drink in tiny old alleys" };

describe("rewrite cache", () => {
  it("round-trips through serialize/parse", () => {
    const c = upsertRewrite(
      emptyRewriteCache("qwen3.6-35b"),
      q,
      "bars alley izakaya golden gai",
    );
    const back = parseRewriteCache(serializeRewriteCache(c));
    expect(getRewrite(back, q)).toBe("bars alley izakaya golden gai");
    expect(back.promptSha).toBe(REWRITE_PROMPT_SHA);
  });

  it("throws on a missing entry instead of silently using the raw query", () => {
    expect(() => getRewrite(emptyRewriteCache("m"), q)).toThrow(
      /missing rewrite.*q-tokyo-001/,
    );
  });

  it("throws when the query text changed since it was rewritten", () => {
    const c = upsertRewrite(emptyRewriteCache("m"), q, "bars");
    expect(() => getRewrite(c, { ...q, text: "museums" })).toThrow(/stale/);
  });

  it("refuses a cache produced by a different prompt", () => {
    const json = serializeRewriteCache(emptyRewriteCache("m")).replace(
      REWRITE_PROMPT_SHA,
      "0".repeat(64),
    );
    expect(() => parseRewriteCache(json)).toThrow(/prompt/);
  });
});

describe("parseRewriteOutput", () => {
  it("drops a <think> block, quotes and trailing punctuation, keeps one line", () => {
    expect(
      parseRewriteOutput('<think>hmm</think>\n"bars, izakaya, alley."\nextra'),
    ).toBe("bars, izakaya, alley");
  });

  it("throws on empty output", () => {
    expect(() => parseRewriteOutput("<think>x</think>  ")).toThrow(/empty/);
  });

  it("caps runaway output at 200 characters", () => {
    expect(parseRewriteOutput("a ".repeat(500)).length).toBeLessThanOrEqual(
      200,
    );
  });
});
