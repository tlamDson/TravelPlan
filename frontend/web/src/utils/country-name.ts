import type { Language } from "@/stores/useTranslationStore";
import { getLocaleCode } from "./locale";

/** English country name -> ISO region code, built once from Intl. */
let englishToRegion: Map<string, string> | null = null;

function getEnglishToRegion(): Map<string, string> {
  if (englishToRegion) return englishToRegion;
  const map = new Map<string, string>();
  const en = new Intl.DisplayNames("en", { type: "region" });
  const A = "A".charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      const name = en.of(code);
      // Unassigned codes echo the code back.
      if (name && name !== code) map.set(name.toLowerCase(), code);
    }
  }
  // Names the backend/AI commonly emits that differ from CLDR's English names.
  map.set("usa", "US");
  map.set("united states of america", "US");
  map.set("uk", "GB");
  map.set("czech republic", "CZ");
  englishToRegion = map;
  return map;
}

/**
 * Translates an English country name to the UI language with Intl.DisplayNames.
 * Returns the input unchanged when it is not a known country.
 */
export function localizeCountryName(name: string, lang?: Language): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  const region = getEnglishToRegion().get(trimmed.toLowerCase());
  if (!region) return name;
  try {
    return (
      new Intl.DisplayNames(getLocaleCode(lang), { type: "region" }).of(
        region,
      ) ?? name
    );
  } catch {
    return name;
  }
}

/**
 * Localizes the country in a "City, Country" destination. Only the last
 * comma-separated segment is treated as a country; the rest is left as is.
 */
export function localizeDestination(
  destination: string,
  lang?: Language,
): string {
  if (!destination) return destination;
  const idx = destination.lastIndexOf(",");
  if (idx === -1) return localizeCountryName(destination, lang);
  const head = destination.slice(0, idx + 1);
  const tail = destination.slice(idx + 1);
  const localized = localizeCountryName(tail, lang);
  return localized === tail ? destination : `${head} ${localized}`;
}
