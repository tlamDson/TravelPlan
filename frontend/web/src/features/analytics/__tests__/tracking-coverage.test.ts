import { ANALYTICS_EVENT_NAMES } from "@travelplan/shared";
import { describe, expect, it } from "vitest";

/**
 * M9a tracking coverage (B2 plan, PR 4): which catalog events the web app
 * emits from a real call site. The analytics feature itself and tests are
 * left out, so only product code counts.
 */
const sources = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/**/__tests__/**",
    "!/src/**/*.test.{ts,tsx}",
    "!/src/test/**",
    "!/src/features/analytics/**",
  ],
  { query: "?raw", import: "default", eager: true },
);

const CALL_SITE = /\btrack(?:Once)?\(\s*["'`]([a-z_]+)["'`]/g;

function trackedNames(): Set<string> {
  const names = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const match of text.matchAll(CALL_SITE)) names.add(match[1]);
  }
  return names;
}

const WEB_EVENTS = ANALYTICS_EVENT_NAMES.filter(
  (name) => name !== "experiment_exposure",
);

describe("web tracking coverage (M9a)", () => {
  it("scans the app source", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it("emits every web event in the catalog from a product call site", () => {
    const tracked = trackedNames();
    const missing = WEB_EVENTS.filter((name) => !tracked.has(name));

    expect(missing).toEqual([]);
  });

  it("tracks only names that exist in the catalog", () => {
    const unknown = [...trackedNames()].filter(
      (name) => !(WEB_EVENTS as readonly string[]).includes(name),
    );

    expect(unknown).toEqual([]);
  });
});
