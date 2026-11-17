import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * [Guard] Unit tests that `await import()` heavy modules (stripe, @google/
 * generative-ai, mongoose models) blow vitest's 5 s default when the full
 * suite runs under CPU load (import time climbs past 300 s in aggregate).
 * Which test times out varies run to run, so the fix is a roomier timeout in
 * the config, not per-test overrides.
 *
 * The config is read as text, not imported: the backend Docker build copies
 * only `backend/src`, and `tsc` compiles this file there, so an import of
 * `../../vitest.config` would fail the "Backend Docker Build" check.
 */
const configSource = readFileSync(
  resolve(__dirname, "../../vitest.config.ts"),
  "utf8",
);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function timeoutOf(
  key: "testTimeout" | "hookTimeout",
  source: string = configSource,
): number {
  const match = new RegExp(String.raw`^\s*${key}:\s*([\d_]+)`, "m").exec(
    stripComments(source),
  );
  return match ? Number(match[1]!.replace(/_/g, "")) : 0;
}

describe("vitest.config unit-run timeouts", () => {
  it("gives tests at least 20 s so heavy dynamic imports survive parallel load", () => {
    expect(timeoutOf("testTimeout")).toBeGreaterThanOrEqual(20_000);
  });

  it("gives hooks at least 20 s", () => {
    expect(timeoutOf("hookTimeout")).toBeGreaterThanOrEqual(20_000);
  });

  it("ignores a timeout that is commented out", () => {
    const commented = [
      "// testTimeout: 20_000,",
      "/* hookTimeout: 20_000, */",
    ].join("\n");
    expect(timeoutOf("testTimeout", commented)).toBe(0);
    expect(timeoutOf("hookTimeout", commented)).toBe(0);
  });
});
