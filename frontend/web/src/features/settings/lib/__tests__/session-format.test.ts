import { describe, it, expect } from "vitest";
import { formatLastActive } from "../session-format";

const NOW = new Date("2026-11-14T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3600_000;

describe("formatLastActive", () => {
  it("formats hours in Vietnamese", () => {
    expect(formatLastActive(ago(2 * HOUR), NOW, "Vietnamese")).toBe(
      "2 giờ trước",
    );
  });

  it("formats yesterday in Vietnamese and English", () => {
    expect(formatLastActive(ago(24 * HOUR), NOW, "Vietnamese")).toBe("Hôm qua");
    expect(formatLastActive(ago(24 * HOUR), NOW, "English (US)")).toBe(
      "yesterday",
    );
  });

  it("formats minutes in French", () => {
    expect(formatLastActive(ago(3 * 60_000), NOW, "French")).toBe(
      "il y a 3 minutes",
    );
  });

  it("falls back to an absolute date after 30 days", () => {
    const out = formatLastActive(ago(45 * 24 * HOUR), NOW, "English (US)");
    expect(out).toBe("Sep 30, 2026");
  });

  it("accepts epoch milliseconds (Clerk lastActiveAt)", () => {
    expect(formatLastActive(ago(2 * HOUR).getTime(), NOW, "Vietnamese")).toBe(
      "2 giờ trước",
    );
  });
});
