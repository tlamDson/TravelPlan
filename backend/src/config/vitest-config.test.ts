import { describe, it, expect } from "vitest";
import config from "../../vitest.config";

/**
 * [Guard] Unit tests that `await import()` heavy modules (stripe, @google/
 * generative-ai, mongoose models) blow vitest's 5 s default when the full
 * suite runs under CPU load (import time climbs past 300 s in aggregate).
 * Which test times out varies run to run, so the fix is a roomier timeout in
 * the config, not per-test overrides.
 */
describe("vitest.config unit-run timeouts", () => {
  it("gives tests at least 20 s so heavy dynamic imports survive parallel load", () => {
    expect(config.test?.testTimeout).toBeGreaterThanOrEqual(20_000);
  });

  it("gives hooks at least 20 s", () => {
    expect(config.test?.hookTimeout).toBeGreaterThanOrEqual(20_000);
  });
});
