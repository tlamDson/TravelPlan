import type { Language } from "@/stores/useTranslationStore";

/**
 * Maps the app's Language type to standard BCP 47 locale codes.
 */
export function getLocaleCode(lang?: Language): string {
  switch (lang) {
    case "French":
      return "fr-FR";
    case "Vietnamese":
      return "vi-VN";
    case "English (US)":
    default:
      return "en-US";
  }
}
