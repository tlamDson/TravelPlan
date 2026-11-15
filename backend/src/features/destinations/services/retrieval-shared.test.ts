import { describe, it, expect } from "vitest";
import {
  buildRetrievalQuery,
  formatInsightsForPrompt,
} from "./retrieval-shared";

describe("buildRetrievalQuery", () => {
  it("always includes the destination", () => {
    expect(buildRetrievalQuery("Hanoi, Vietnam", {} as never)).toBe(
      "Hanoi, Vietnam",
    );
  });

  it("appends keyword bags for each focus area, in FOCUS declaration order", () => {
    const query = buildRetrievalQuery("Hanoi, Vietnam", {
      focus: ["Lifestyle", "Gastronomy"],
    } as never);

    expect(query).toBe(
      "Hanoi, Vietnam local food restaurants cafes culinary nightlife bars shopping local life",
    );
  });

  it("appends restaurants dining keywords when foodAsMainActivities is set", () => {
    const query = buildRetrievalQuery("Paris, France", {
      constraints: { foodAsMainActivities: true },
    } as never);

    expect(query).toContain("restaurants dining unique eats");
  });

  it("appends relaxed-pace keywords only for pace === 'relaxed'", () => {
    expect(
      buildRetrievalQuery("Paris, France", { pace: "relaxed" } as never),
    ).toContain("chill relaxing peaceful");
    expect(
      buildRetrievalQuery("Paris, France", { pace: "packed" } as never),
    ).not.toContain("chill relaxing peaceful");
  });
});

describe("formatInsightsForPrompt", () => {
  it('formats a 1-indexed numbered list of "name (category): description"', () => {
    const text = formatInsightsForPrompt([
      {
        id: "1",
        cityIdKey: "hanoi",
        name: "Old Quarter",
        category: "history",
        description: "Historic core.",
        tags: [],
        score: 0.9,
      },
      {
        id: "2",
        cityIdKey: "hanoi",
        name: "Train Street",
        category: "other",
        description: "Narrow street with a live railway.",
        tags: [],
        score: 0.8,
      },
    ]);

    expect(text).toBe(
      "1. Old Quarter (history): Historic core.\n" +
        "2. Train Street (other): Narrow street with a live railway.",
    );
  });

  it("returns an empty string for an empty result list", () => {
    expect(formatInsightsForPrompt([])).toBe("");
  });
});
