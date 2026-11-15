import { describe, it, expect, vi, beforeEach } from "vitest";

async function loadWith(value: string) {
  vi.doMock("../../config/env", () => ({ env: { ANALYTICS_ENABLED: value } }));
  const { isAnalyticsEnabled } = await import("./analytics-flag");
  return isAnalyticsEnabled();
}

describe("isAnalyticsEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns true when ANALYTICS_ENABLED is exactly 'true'", async () => {
    expect(await loadWith("true")).toBe(true);
  });

  it("returns false when unset (empty string) — ingest is opt-in everywhere", async () => {
    expect(await loadWith("")).toBe(false);
  });

  it("returns false for loosely-truthy values like '1' or 'TRUE'", async () => {
    expect(await loadWith("1")).toBe(false);
    vi.resetModules();
    expect(await loadWith("TRUE")).toBe(false);
  });
});
