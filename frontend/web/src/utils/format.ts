/**
 * Date, Time & Currency Formatting Utilities
 * Using Native Browser Intl API for localization
 */

import { differenceInDays, isPast, isFuture } from "date-fns";
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
 * Format a date for display using native Intl API
 * Example: "Feb 23, 2026" (EN), "23 févr. 2026" (FR)
 */
export function formatDate(
  date: string | Date,
  lang?: Language,
  options?: Intl.DateTimeFormatOptions,
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return new Intl.DateTimeFormat(
    getLocaleCode(lang),
    options || defaultOptions,
  ).format(new Date(date));
}

/**
 * Trip dates are calendar dates (no time zone). The API sends them as UTC
 * midnight ("2026-11-18T00:00:00.000Z"), so parsing them with `new Date()` and
 * formatting in local time shifts them back one day in negative-offset zones.
 * Read the Y-M-D part and build a local-midnight Date instead.
 */
export function toCalendarDate(value: string | Date): Date {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  return new Date(value);
}

/**
 * Format a date range natively
 * Uses Intl.DateTimeFormat.formatRange to smartly collapse months/years
 * Example: "Feb 23 - 25, 2026"
 */
export function formatDateRange(
  start: string | Date,
  end: string | Date,
  lang?: Language,
): string {
  const startDate = toCalendarDate(start);
  const endDate = toCalendarDate(end);
  const locale = getLocaleCode(lang);

  // Create a formatter that handles ranges intelligently
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year:
      startDate.getFullYear() !== endDate.getFullYear() ? "numeric" : undefined,
  });

  const withRange = formatter as Intl.DateTimeFormat & {
    formatRange?: (a: Date, b: Date) => string;
  };
  try {
    if (typeof withRange.formatRange === "function") {
      return withRange.formatRange(startDate, endDate);
    }
    throw new Error("formatRange unsupported");
  } catch {
    // Fallback for older browsers
    const startStr = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    }).format(startDate);
    const endStr = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
    }).format(endDate);
    return `${startStr} - ${endStr}`;
  }
}

/**
 * Format currency natively
 * Example: "$1,250.00" (EN-USD), "1 250,00 €" (FR-EUR), "1.250.000 ₫" (VI-VND)
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  lang?: Language,
): string {
  try {
    return new Intl.NumberFormat(getLocaleCode(lang), {
      style: "currency",
      currency: currencyCode || "USD",
      currencyDisplay: "symbol",
      maximumFractionDigits: currencyCode === "VND" ? 0 : 2,
    }).format(amount);
  } catch {
    // Fallback if the browser doesn't like the currency code
    return `${amount.toFixed(currencyCode === "VND" ? 0 : 2)} ${currencyCode}`;
  }
}

/**
 * Calculate trip duration in days
 */
export function getTripDuration(
  start: string | Date,
  end: string | Date,
): number {
  return differenceInDays(new Date(end), new Date(start)) + 1;
}

/**
 * Check if a trip is upcoming
 */
export function isUpcoming(startDate: string | Date): boolean {
  return isFuture(new Date(startDate));
}

/**
 * Check if a trip is in the past
 */
export function isPastTrip(endDate: string | Date): boolean {
  return isPast(new Date(endDate));
}

/**
 * Known default prefixes for trip titles across supported languages
 */
const DEFAULT_TRIP_PREFIXES = ["Trip to ", "Voyage à ", "Chuyến đi tới "];

/**
 * Localizes a trip title on the fly if it matches one of the default generated formats.
 * E.g., translates "Chuyến đi tới Paris" to "Trip to Paris" if language is English.
 */
export function getLocalizedTripTitle(
  title: string,
  t: (key: string) => string,
): string {
  if (!title) return title;

  for (const prefix of DEFAULT_TRIP_PREFIXES) {
    if (title.startsWith(prefix)) {
      const destination = title.slice(prefix.length);
      return `${t("trips.defaultTitle")} ${destination}`;
    }
  }

  return title;
}

/**
 * Static Exchange Rates (Fallback)
 * In a real app, this should be fetched from a live API.
 * Base: USD
 */
const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  VND: 25000,
};

/**
 * Converts an amount from one currency to another using static rates.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = EXCHANGE_RATES[fromCurrency] || 1;
  const toRate = EXCHANGE_RATES[toCurrency] || 1;

  // Convert to base (USD) then to target
  const amountInUSD = amount / fromRate;
  return amountInUSD * toRate;
}

/**
 * Format Google Places Price Level natively into a currency range string
 */
export function formatPriceLevel(
  level: number,
  currencyCode: string,
  lang?: Language,
): string {
  const c25 = convertCurrency(25, "USD", currencyCode);
  const c50 = convertCurrency(50, "USD", currencyCode);
  const c100 = convertCurrency(100, "USD", currencyCode);

  const tUnder =
    lang === "Vietnamese" ? "Dưới" : lang === "French" ? "Moins de" : "Under";
  const tOver =
    lang === "Vietnamese" ? "Trên" : lang === "French" ? "Plus de" : "Over";

  const compactFormat = (val: number) =>
    new Intl.NumberFormat(getLocaleCode(lang), {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 0,
    }).format(val);

  switch (level) {
    case 1:
      return `${tUnder} ${compactFormat(c25)}`;
    case 2:
      return `${compactFormat(c25)} - ${compactFormat(c50)}`;
    case 3:
      return `${compactFormat(c50)} - ${compactFormat(c100)}`;
    case 4:
      return `${tOver} ${compactFormat(c100)}`;
    default:
      return "";
  }
}

/**
 * Format Google Places Price Level into a locale category
 */
export function formatPriceCategory(level: number, lang?: Language): string {
  if (lang === "Vietnamese") {
    switch (level) {
      case 1:
        return "Bình dân";
      case 2:
        return "Trung bình";
      case 3:
        return "Cao cấp";
      case 4:
        return "Sang trọng";
    }
  }
  if (lang === "French") {
    switch (level) {
      case 1:
        return "Économique";
      case 2:
        return "Modéré";
      case 3:
        return "Haut de gamme";
      case 4:
        return "Luxe";
    }
  }
  switch (level) {
    case 1:
      return "Budget";
    case 2:
      return "Moderate";
    case 3:
      return "Upscale";
    case 4:
      return "Luxury";
  }
  return "";
}
