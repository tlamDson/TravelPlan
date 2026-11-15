import { describe, it, expect } from "vitest";
import { runAllConstraintChecks } from "./index";
import type { ConstraintTrip } from "./types";

// JSON-imported fixtures type coordinates as number[], not the tuple
// ConstraintTrip expects — the fixture files are the real contract, so
// cast rather than loosen the type for every non-JSON-sourced caller.
function asConstraintTrip(trip: unknown): ConstraintTrip {
  return trip as ConstraintTrip;
}

/**
 * backend/src/test/fixtures/*.json were committed for exactly this
 * purpose ("golden fixture") but no test file actually loaded them until
 * now — confirmed by grep across the repo before writing this suite.
 */

describe("runAllConstraintChecks against the committed golden fixtures", () => {
  it("valid-trip.json: places resolve, no duplicates/outliers, but day count is short (fixture is a minimal 1-day sample of a 4-day trip)", async () => {
    const trip = (await import("../../../test/fixtures/valid-trip.json"))
      .default;
    const results = runAllConstraintChecks(asConstraintTrip(trip));

    expect(results.unresolvedPlaces.pass).toBe(true);
    expect(results.geoOutliers.pass).toBe(true);
    expect(results.noDuplicates.pass).toBe(true);
    expect(results.dayCount.pass).toBe(false);
  });

  it("malformed-trip.json: fails both dayCount (endDate before startDate) and unresolvedPlaces (activity has no location)", async () => {
    const trip = (await import("../../../test/fixtures/malformed-trip.json"))
      .default;
    const results = runAllConstraintChecks(asConstraintTrip(trip));

    expect(results.dayCount.pass).toBe(false);
    expect(results.unresolvedPlaces.pass).toBe(false);
  });

  it("empty-results.json: 3 empty days pass every per-activity check vacuously, but that's exactly the case a constraint checker alone can't catch — zero activities isn't zero problems, it's the AI-validated-nothing failure mode. See tech-defaults.md's [BUG] notes for what does catch it (status: FAILED, or Phase 5's generationMeta).", async () => {
    const trip = (await import("../../../test/fixtures/empty-results.json"))
      .default;
    const results = runAllConstraintChecks(asConstraintTrip(trip));

    expect(results.dayCount.pass).toBe(true); // 3 days requested, 3 days present
    expect(results.unresolvedPlaces.pass).toBe(true); // vacuously — 0/0
    expect(results.unresolvedPlaces.metric).toBe(0);
  });
});
