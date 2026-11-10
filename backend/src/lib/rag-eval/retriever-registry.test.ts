import { describe, it, expect } from "vitest";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { buildRetrievers, KNOWN_CONFIGS } from "./retriever-registry";

const snap = tinySnapshot();

describe("buildRetrievers", () => {
  it("builds the requested configs in the requested order", () => {
    expect(buildRetrievers(snap, ["vector-prod"]).map((r) => r.id)).toEqual([
      "vector-prod",
    ]);
    expect(KNOWN_CONFIGS).toContain("vector-prod");
  });

  it("rejects an unknown config and lists the known ones", () => {
    expect(() => buildRetrievers(snap, ["vector-prod", "colbert"])).toThrow(
      /colbert.*vector-prod/,
    );
  });

  it("rejects an empty or duplicated list", () => {
    expect(() => buildRetrievers(snap, [])).toThrow();
    expect(() => buildRetrievers(snap, ["vector-prod", "vector-prod"])).toThrow(
      /twice/,
    );
  });
});
