import { describe, it, expect } from "vitest";
import { getStatusColor } from "../tripsPageFilters";

/**
 * [Guard] The status filter dropdown previously used 6 raw
 * bg-{color}-600/700 + text-white combos, plus a visually-inconsistent
 * solid-color look next to the "sort"/"all" branches' lighter tinted
 * accent. Now every branch uses the same tag-*-text tinted-accent idiom.
 */
describe("getStatusColor", () => {
  it.each([
    "UPCOMING",
    "IN_TRIP",
    "COMPLETED",
    "CANCELLED",
    "GENERATING",
    "FAILED",
  ] as const)(
    "uses a tag-*-text tinted accent for %s, not raw color+white",
    (status) => {
      const className = getStatusColor(status);

      expect(className).toMatch(/tag-\w+-text/);
      expect(className).not.toMatch(/-600\/80|-700\/80|text-white/);
    },
  );

  it("keeps the 'sort' branch's existing primary-tint idiom", () => {
    expect(getStatusColor("sort")).toContain("bg-primary/20");
  });

  it("keeps the 'all' branch's existing accent idiom", () => {
    expect(getStatusColor("all")).toContain("bg-accent");
  });
});
