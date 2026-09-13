import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

/**
 * [Guard] Every CSS variable in index.css must be reachable as a Tailwind
 * class, and every var tailwind.config.js references must exist in both
 * :root and .dark. Without this, orphan tokens (no bg-tag-gray or
 * bg-callout-blue class exists) push devs toward hardcoded Tailwind
 * palette colors instead — see .claude/rules/tech-defaults.md "Nợ kỹ thuật đã xác minh".
 */

const TAILWIND_CONFIG_PATH = path.join(__dirname, "../../tailwind.config.js");
const INDEX_CSS_PATH = path.join(__dirname, "../index.css");

// Structural tokens that are not colors and never become a Tailwind color
// class (border-radius scale lives under theme.extend.borderRadius).
const NON_COLOR_VARS = new Set(["radius"]);

// Vars that are consumed only as literal hsl(...) strings via TS constants
// (frontend/web/src/features/map/utils/dayColors.ts,
// frontend/web/src/features/reliability/lib/chart-colors.ts), never as a
// static `bg-day-1`-style Tailwind class — day markers are picked by a
// dynamic runtime index, and Mapbox GL paint properties don't support
// var() at all. Exempt from the "reachable via Tailwind class" check.
const TAILWIND_EXEMPT_PREFIXES = ["day-", "reliability-"];
function isTailwindExempt(varName: string): boolean {
  return (
    NON_COLOR_VARS.has(varName) ||
    TAILWIND_EXEMPT_PREFIXES.some((prefix) => varName.startsWith(prefix))
  );
}

function extractBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Could not find "${selector} {" block in index.css`);
  }
  const braceStart = source.indexOf("{", start);
  const braceEnd = source.indexOf("}", braceStart);
  return source.slice(braceStart + 1, braceEnd);
}

function extractDeclaredVars(block: string): string[] {
  const matches = block.matchAll(/--([\w-]+):\s*[^;]+;/g);
  return [...matches].map((m) => m[1]);
}

function extractReferencedVars(source: string): Set<string> {
  const matches = source.matchAll(/var\(--([\w-]+)\)/g);
  return new Set([...matches].map((m) => m[1]));
}

describe("[Guard] design token parity between index.css and tailwind.config.js", () => {
  const cssSource = fs.readFileSync(INDEX_CSS_PATH, "utf8");
  const tailwindSource = fs.readFileSync(TAILWIND_CONFIG_PATH, "utf8");

  const rootBlock = extractBlock(cssSource, ":root");
  const darkBlock = extractBlock(cssSource, ".dark");

  const rootVars = extractDeclaredVars(rootBlock);
  const darkVars = extractDeclaredVars(darkBlock);
  const rootVarSet = new Set(rootVars);
  const darkVarSet = new Set(darkVars);
  const referencedVars = extractReferencedVars(tailwindSource);

  it("sanity: parsed a non-trivial number of vars from each block", () => {
    expect(rootVars.length).toBeGreaterThan(20);
    expect(darkVars.length).toBeGreaterThan(20);
  });

  it("declares no CSS variable twice within the same block", () => {
    const findDuplicates = (vars: string[]) => {
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const v of vars) {
        if (seen.has(v)) dupes.add(v);
        seen.add(v);
      }
      return [...dupes];
    };

    expect(findDuplicates(rootVars)).toEqual([]);
    expect(findDuplicates(darkVars)).toEqual([]);
  });

  it("defines every var tailwind.config.js references in BOTH :root and .dark", () => {
    // --radius (and any other structural, non-color var) is intentionally
    // not re-themed in .dark, so it's exempt from the both-blocks check.
    const themedReferencedVars = [...referencedVars].filter(
      (v) => !NON_COLOR_VARS.has(v),
    );
    const missingFromRoot = themedReferencedVars.filter(
      (v) => !rootVarSet.has(v),
    );
    const missingFromDark = themedReferencedVars.filter(
      (v) => !darkVarSet.has(v),
    );

    expect(missingFromRoot).toEqual([]);
    expect(missingFromDark).toEqual([]);
  });

  it("exposes every non-structural, non-exempt :root var as a reachable Tailwind color class", () => {
    const orphans = rootVars.filter(
      (v) => !isTailwindExempt(v) && !referencedVars.has(v),
    );

    expect(orphans).toEqual([]);
  });
});
