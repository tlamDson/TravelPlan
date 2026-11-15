import { describe, it, expect } from "vitest";
import { GEMINI_MODEL, GEMINI_INSIGHT_MODEL } from "./gemini-models";

describe("GEMINI_MODEL", () => {
  it("is not one of the confirmed-dead model strings", () => {
    expect(GEMINI_MODEL).not.toBe("gemini-2.0-flash");
    expect(GEMINI_MODEL).not.toBe("gemini-2.5-flash");
  });

  it("is pinned to the currently-verified model", () => {
    expect(GEMINI_MODEL).toBe("gemini-3.6-flash");
  });
});

describe("GEMINI_INSIGHT_MODEL", () => {
  it("is pinned to the currently-verified lite model", () => {
    expect(GEMINI_INSIGHT_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("is a DIFFERENT model from GEMINI_MODEL — this is load-bearing, not incidental", () => {
    // Live incident 2026-08-22: these used to be the same constant. Google's
    // free-tier quota is per-model-per-day, so sharing a model between the
    // RAG scraper (bursty, ~78 calls/run) and real trip generation meant a
    // corpus seed could exhaust the day's quota for actual user traffic too.
    // If this test ever needs to change because someone merged the
    // constants back, that's the regression this test exists to catch.
    expect(GEMINI_INSIGHT_MODEL).not.toBe(GEMINI_MODEL);
  });
});
