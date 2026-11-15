import { describe, it, expect } from "vitest";
import { formatTimeRange } from "../time-slot";

describe("formatTimeRange", () => {
  it("English (US) keeps the 12-hour AM/PM clock", () => {
    expect(formatTimeRange("09:30", "11:30", "English (US)")).toBe(
      "9:30 AM – 11:30 AM",
    );
    expect(formatTimeRange("00:05", "13:00", "English (US)")).toBe(
      "12:05 AM – 1:00 PM",
    );
  });

  it("Vietnamese uses the 24-hour clock with zero-padded hours", () => {
    expect(formatTimeRange("09:30", "11:30", "Vietnamese")).toBe(
      "09:30 – 11:30",
    );
    expect(formatTimeRange("14:00", "23:45", "Vietnamese")).toBe(
      "14:00 – 23:45",
    );
  });

  it("French uses the 24-hour clock", () => {
    expect(formatTimeRange("09:30", "18:00", "French")).toBe("09:30 – 18:00");
  });

  it("renders a single time when there is no end time", () => {
    expect(formatTimeRange("09:30", undefined, "Vietnamese")).toBe("09:30");
    expect(formatTimeRange("15:00", undefined, "English (US)")).toBe("3:00 PM");
  });

  it("returns an empty string without a start time", () => {
    expect(formatTimeRange(undefined, "11:00", "Vietnamese")).toBe("");
  });

  it("defaults to English when no language is given", () => {
    expect(formatTimeRange("09:30", "11:30")).toBe("9:30 AM – 11:30 AM");
  });
});
