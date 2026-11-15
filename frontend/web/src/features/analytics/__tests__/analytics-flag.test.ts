import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnalyticsEnabled } from "../lib/analytics-flag";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAnalyticsEnabled()", () => {
  it("is off when VITE_ANALYTICS_ENABLED is unset", () => {
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "");
    expect(isAnalyticsEnabled()).toBe(false);
  });

  it.each(["1", "TRUE", "yes", "false"])(
    "is off for %j, like the server flag that needs exactly true",
    (value) => {
      vi.stubEnv("VITE_ANALYTICS_ENABLED", value);
      expect(isAnalyticsEnabled()).toBe(false);
    },
  );

  it("is on only for exactly true", () => {
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "true");
    expect(isAnalyticsEnabled()).toBe(true);
  });
});
