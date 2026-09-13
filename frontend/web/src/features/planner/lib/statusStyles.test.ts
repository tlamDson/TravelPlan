import { describe, it, expect } from "vitest";
import { TripStatusValues } from "@travelplan/shared";
import {
  STATUS_TONE_STYLES,
  TRIP_STATUS_TONE,
  JOB_STATUS_TONE,
  JOB_STATUS_ICON,
} from "./statusStyles";

const JOB_STATUS_VALUES = [
  "IDLE",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

/**
 * [Guard] TripStatusBadge, JobStatusIndicator/JobStatusBadge, and TripCard
 * previously hand-rolled 3 different raw-Tailwind-palette color schemes for
 * the same status vocabulary (e.g. QUEUED was blue in one, yellow in
 * another). This is the single canonical status->tone mapping all three
 * consume, table-driven over every enum value so a status added to
 * TripStatus/JobStatus without a tone here fails loudly instead of
 * silently falling through to `undefined`.
 */

describe("[Guard] statusStyles covers every TripStatus/JobStatus value", () => {
  it("has a tone for every TripStatus value", () => {
    for (const status of TripStatusValues) {
      expect(
        TRIP_STATUS_TONE[status],
        `TRIP_STATUS_TONE.${status}`,
      ).toBeDefined();
      expect(STATUS_TONE_STYLES[TRIP_STATUS_TONE[status]]).toBeDefined();
    }
  });

  it("has a tone for every JobStatus value", () => {
    for (const status of JOB_STATUS_VALUES) {
      expect(
        JOB_STATUS_TONE[status],
        `JOB_STATUS_TONE.${status}`,
      ).toBeDefined();
      expect(STATUS_TONE_STYLES[JOB_STATUS_TONE[status]]).toBeDefined();
    }
  });

  it("has an icon for every JobStatus value", () => {
    for (const status of JOB_STATUS_VALUES) {
      expect(
        JOB_STATUS_ICON[status],
        `JOB_STATUS_ICON.${status}`,
      ).toBeDefined();
    }
  });

  it("every tone style has all 3 render-context class strings", () => {
    for (const [tone, style] of Object.entries(STATUS_TONE_STYLES)) {
      expect(style.pillClassName, `${tone}.pillClassName`).toBeTruthy();
      expect(style.textClassName, `${tone}.textClassName`).toBeTruthy();
      expect(
        style.overlayPillClassName,
        `${tone}.overlayPillClassName`,
      ).toBeTruthy();
    }
  });

  it("QUEUED resolves to the same tone for both TripStatus and JobStatus (the divergence this PR fixes)", () => {
    expect(TRIP_STATUS_TONE.QUEUED).toBe(JOB_STATUS_TONE.QUEUED);
  });

  it("PROCESSING resolves to the same tone for both TripStatus and JobStatus", () => {
    expect(TRIP_STATUS_TONE.PROCESSING).toBe(JOB_STATUS_TONE.PROCESSING);
  });

  it("COMPLETED/FAILED/CANCELLED resolve to the same tone for both TripStatus and JobStatus", () => {
    expect(TRIP_STATUS_TONE.COMPLETED).toBe(JOB_STATUS_TONE.COMPLETED);
    expect(TRIP_STATUS_TONE.FAILED).toBe(JOB_STATUS_TONE.FAILED);
    expect(TRIP_STATUS_TONE.CANCELLED).toBe(JOB_STATUS_TONE.CANCELLED);
  });
});
