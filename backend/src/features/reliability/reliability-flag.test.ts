import { describe, it, expect, vi, beforeEach } from "vitest";

describe("isReliabilityApiEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when ENABLE_RELIABILITY_API is exactly 'true'", async () => {
    vi.doMock("../../config/env", () => ({
      env: { ENABLE_RELIABILITY_API: "true" },
    }));
    const { isReliabilityApiEnabled } = await import("./reliability-flag");
    expect(isReliabilityApiEnabled()).toBe(true);
  });

  it("returns false when unset (empty string)", async () => {
    vi.doMock("../../config/env", () => ({
      env: { ENABLE_RELIABILITY_API: "" },
    }));
    const { isReliabilityApiEnabled } = await import("./reliability-flag");
    expect(isReliabilityApiEnabled()).toBe(false);
  });

  it("returns false for a loosely-truthy value like '1' or 'yes' — strict equality only, unlike calendar sync's flag", async () => {
    vi.doMock("../../config/env", () => ({
      env: { ENABLE_RELIABILITY_API: "1" },
    }));
    const { isReliabilityApiEnabled } = await import("./reliability-flag");
    expect(isReliabilityApiEnabled()).toBe(false);
  });

  it("does not default to enabled in development — SLO must be explicitly turned on everywhere", async () => {
    vi.doMock("../../config/env", () => ({
      env: { ENABLE_RELIABILITY_API: "", NODE_ENV: "development" },
    }));
    const { isReliabilityApiEnabled } = await import("./reliability-flag");
    expect(isReliabilityApiEnabled()).toBe(false);
  });
});
