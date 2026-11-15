import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Backend source, scripts and lint config are written in English.
 * Vietnamese text may only appear as data (place names, tokenizer inputs,
 * hash vectors), never in comments, logs, errors or test names.
 */

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const SCAN_TARGETS = ["src", "scripts", "eslint.config.mjs"];
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|sh|md)$/;

// Written with escapes so this file contains no Vietnamese letters itself.
const VIETNAMESE_LETTERS =
  /[\u00C0\u00C1\u00C3\u00C8\u00C9\u00CA\u00CC\u00CD\u00D2\u00D3\u00D5\u00D9\u00DA\u00DD\u00E0\u00E1\u00E3\u00E8\u00E9\u00EA\u00EC\u00ED\u00F2\u00F3\u00F5\u00F9\u00FA\u00FD\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9\u00C2\u00E2\u00D4\u00F4]/;

/** Intentional leftovers: relative path -> max number of lines allowed. */
const ALLOWED_DATA_LINES: Record<string, number> = {
  // Vietnamese place names used as seed data.
  "scripts/seed-data/extended-cities.json": 10,
  // Vietnamese place names / strings used as test inputs and fixtures.
  "src/test/fixtures/valid-trip.json": 2,
  "src/test/integration/destinations.integration.test.ts": 1,
  "src/features/destinations/services/eval-corpus-selection.test.ts": 4,
  "src/features/destinations/services/seed-payload-upsert.test.ts": 4,
  "src/features/planner/utils/destination-utils.test.ts": 1,
  "src/lib/rag-eval/label.test.ts": 1,
  "src/features/planner/services/validation.service.ts": 1,
  "src/lib/rag-eval/constraints/day-count.test.ts": 1,
  // Vietnamese diacritic handling is the behaviour under test.
  "src/lib/rag-eval/tokenize.ts": 2,
  "src/lib/rag-eval/tokenize.test.ts": 4,
  // Vietnamese destination aliases must match user input.
  "src/features/planner/utils/destination-utils.ts": 2,
  // Unicode hash vector shared with the Python implementation.
  "src/features/experiments/vectors/assignment-vectors.ts": 1,
  "src/features/experiments/services/assignment.test.ts": 1,
  // Asserts a phrase in CLAUDE.md, which is still Vietnamese.
  "src/config/claude-docs-parity.test.ts": 1,
};

function walk(entry: string, out: string[]): void {
  const stat = statSync(entry);
  if (stat.isDirectory()) {
    for (const name of readdirSync(entry)) {
      if (name === "node_modules" || name === "dist") continue;
      walk(path.join(entry, name), out);
    }
  } else if (TEXT_EXT.test(entry)) {
    out.push(entry);
  }
}

function vietnameseLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => VIETNAMESE_LETTERS.test(line.replace(/caf\u00E9/gi, "")));
}

describe("backend is written in English", () => {
  it("has no Vietnamese text outside the allowed data lines", () => {
    const files: string[] = [];
    for (const target of SCAN_TARGETS) {
      walk(path.join(BACKEND_ROOT, target), files);
    }

    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(BACKEND_ROOT, file).split(path.sep).join("/");
      const count = vietnameseLines(file).length;
      const allowed = ALLOWED_DATA_LINES[rel] ?? 0;
      if (count > allowed) violations.push(`${rel}: ${count} (allowed ${allowed})`);
    }

    expect(violations).toEqual([]);
  });
});
