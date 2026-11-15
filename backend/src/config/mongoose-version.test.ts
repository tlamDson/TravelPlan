import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Mongoose advisories fixed in 9.11.4 (includes CVE-2026-125120, sanitizeFilter
// not applied on countDocuments, fixed in 9.9.2).
const MIN_MONGOOSE = [9, 11, 4] as const;

function parse(version: string): number[] {
  return version
    .replace(/^[^\d]*/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
}

function isAtLeast(version: string, min: readonly number[]): boolean {
  const parts = parse(version);
  for (let i = 0; i < min.length; i++) {
    const part = parts[i] ?? 0;
    const floor = min[i] ?? 0;
    if (part !== floor) return part > floor;
  }
  return true;
}

describe("mongoose security floor", () => {
  it("installs a mongoose version with the known CVE fixes", () => {
    const require = createRequire(__filename);
    const { version } = require("mongoose/package.json") as { version: string };
    expect(isAtLeast(version, MIN_MONGOOSE)).toBe(true);
  });

  it("declares a backend dependency range that cannot resolve below the floor", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(isAtLeast(pkg.dependencies.mongoose ?? "0", MIN_MONGOOSE)).toBe(
      true,
    );
  });
});
