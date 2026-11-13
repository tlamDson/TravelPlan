import { TRANSLATIONS } from "@/stores/useTranslationStore";

/**
 * Missing-key check for a non-English render: returns every text node under
 * `root` that still shows an English source string.
 *
 * A text node leaks when it contains an English dictionary value that the
 * target language translates differently (`{placeholders}` match anything),
 * or when it matches one of the `extraPatterns` (hardcoded English that never
 * went through the dictionary). Proper nouns pass because they are neither.
 */
const MIN_VALUE_LENGTH = 4;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function englishSourcePatterns(language: "French" | "Vietnamese"): RegExp[] {
  const en = TRANSLATIONS["English (US)"];
  const target = TRANSLATIONS[language];
  const patterns: RegExp[] = [];
  for (const [key, value] of Object.entries(en)) {
    if (target[key] === value) continue; // same word in both languages
    const literal = value.replace(/\{[^}]+\}/g, "").trim();
    if (literal.length < MIN_VALUE_LENGTH || !/[a-z]/i.test(literal)) continue;
    const body = value
      .split(/\{[^}]+\}/)
      .map(escapeRegExp)
      .join(".+");
    patterns.push(new RegExp(`(^|[^\\p{L}])${body}($|[^\\p{L}])`, "iu"));
  }
  return patterns;
}

export function findEnglishLeaks(
  root: HTMLElement,
  language: "French" | "Vietnamese",
  extraPatterns: RegExp[] = [],
): string[] {
  const patterns = [...englishSourcePatterns(language), ...extraPatterns];
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const leaks: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    if (patterns.some((p) => p.test(text))) leaks.push(text);
  }
  return leaks;
}
