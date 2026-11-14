import { describe, expect, it } from "vitest";

/**
 * Every toast shown by product code takes its text from the dictionary
 * (`toastT("toast.…")` / `t("…")`), never from a string literal.
 */
const sources = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx}",
    "!/src/**/__tests__/**",
    "!/src/**/*.test.{ts,tsx}",
    "!/src/test/**",
    "!/src/hooks/use-toast.tsx",
    "!/src/components/ui/**",
  ],
  { query: "?raw", import: "default", eager: true },
);

const TOAST_CALL =
  /\btoast(?:\.(?:success|error|info|warning|loading|message))?\(/g;

/** Source text of the call's argument list, up to the matching ")". */
function argsAt(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0)
      return text.slice(openIndex + 1, i);
  }
  return text.slice(openIndex + 1);
}

/** Drops nested calls (t(...), toastT(...)) and `{ ... }` option objects. */
function withoutTranslatedParts(args: string): string {
  let out = args;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/\b(?:toastT|t)\([^()]*\)/g, "")
      .replace(/\{[^{}]*\}/g, "");
  }
  return out;
}

describe("toast text comes from i18n", () => {
  it("scans the app source", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it("has no toast call carrying a literal English string", () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(TOAST_CALL)) {
        const args = argsAt(text, m.index! + m[0].length - 1);
        if (/["'`]/.test(withoutTranslatedParts(args))) {
          const line = text.slice(0, m.index).split("\n").length;
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
