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

const TRANSLATED_CALL = /\b(?:toastT|toastTOr|t)\(/g;

/** Options whose values are not user-visible text. */
const NON_TEXT_OPTION =
  /\b(?:variant|id|duration|className|position|important)\s*:\s*(?:"[^"]*"|'[^']*'|[\w.]+)/g;

/**
 * Argument source with translated text (t(...), toastT(...)), non-text
 * options and property names removed. Object-style calls
 * (`toast({ title, description })`) keep their property values, so a
 * literal or raw value there is still caught.
 */
function withoutTranslatedParts(args: string): string {
  let out = args;
  for (let m = TRANSLATED_CALL.exec(out); m; m = TRANSLATED_CALL.exec(out)) {
    const open = m.index + m[0].length - 1;
    const end = open + argsAt(out, open).length + 2;
    out = out.slice(0, m.index) + out.slice(end);
    TRANSLATED_CALL.lastIndex = 0;
  }
  return out
    .replace(NON_TEXT_OPTION, "")
    .replace(/\b\w+\s*:/g, "")
    .replace(/[{,]\s*(?:title|description)(?=\s*[,}])/g, "");
}

const LITERAL = /["'`]/;
const RAW =
  /(^|[^A-Za-z.])(message|msg|err|error|errors|friendlyMessage|data)([^A-Za-z]|$)/;

/** `file:line` of every toast call whose remaining args match `bad`. */
function offendersIn(files: Record<string, string>, bad: RegExp): string[] {
  const offenders: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const m of text.matchAll(TOAST_CALL)) {
      const args = argsAt(text, m.index! + m[0].length - 1);
      if (bad.test(withoutTranslatedParts(args))) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${file}:${line}`);
      }
    }
  }
  return offenders;
}

describe("toast coverage scanner", () => {
  it.each([
    ['toast({ title: "Error", variant: "destructive" })', LITERAL],
    ['toast({ title: t("x"), description: "Failed" })', LITERAL],
    ['toast.error("Failed to save")', LITERAL],
    ['toast.success(t("a"), { description: "Done" })', LITERAL],
    ['toast({ title: t("x"), description: error.message })', RAW],
    ["toast.error(err.message)", RAW],
    ['toast({ title: t("x"), description: data.reason })', RAW],
  ] as const)("flags %s", (src, bad) => {
    expect(offendersIn({ "f.ts": src }, bad)).toEqual(["f.ts:1"]);
  });

  it.each([
    'toast({ title: toastT("a"), description: toastT("b"), variant: "destructive" })',
    'toast.success(toastT("a", { status }))',
    'toast.error(toastTOr(`toast.code.${code}`, "toast.x"))',
    "toast({ title, description, duration: 3000 })",
    'toast.info(toastT("a", { count: Math.max(left, 1) }))',
    'toast.success(toastT("a", { s: toastT(`b_${x.toLowerCase()}`) }))',
  ])("accepts %s", (src) => {
    expect(offendersIn({ "f.ts": src }, LITERAL)).toEqual([]);
    expect(offendersIn({ "f.ts": src }, RAW)).toEqual([]);
  });
});

describe("toast text comes from i18n", () => {
  it("scans the app source", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it("has no toast call carrying a literal English string", () => {
    expect(offendersIn(sources, LITERAL)).toEqual([]);
  });

  it("never shows raw server, Clerk or exception text in a toast", () => {
    expect(offendersIn(sources, RAW)).toEqual([]);
  });
});
