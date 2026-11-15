import type { Locale } from "date-fns";
import { enUS, fr, vi } from "date-fns/locale";
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

/**
 * Maps the app's Language type to the date-fns locale used by
 * react-day-picker and date-fns `format`.
 */
export function getDateFnsLocale(lang?: Language): Locale {
  switch (lang) {
    case "French":
      return fr;
    case "Vietnamese":
      return vi;
    case "English (US)":
    default:
      return enUS;
  }
}
