/**
 * Destination → IANA Timezone Mapping
 *
 * Maps city/country names to their corresponding IANA timezone strings.
 * Used for converting trip itinerary times to correct local timezone when
 * creating Google Calendar events.
 */

/* eslint-disable @typescript-eslint/naming-convention */
export const DESTINATION_TIMEZONE: Record<string, string> = {
  // Vietnam
  hanoi: "Asia/Ho_Chi_Minh",
  "ho chi minh": "Asia/Ho_Chi_Minh",
  "ho chi minh city": "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  "da nang": "Asia/Ho_Chi_Minh",
  hue: "Asia/Ho_Chi_Minh",
  "hoi an": "Asia/Ho_Chi_Minh",
  "nha trang": "Asia/Ho_Chi_Minh",
  "phu quoc": "Asia/Ho_Chi_Minh",

  // France
  paris: "Europe/Paris",
  lyon: "Europe/Paris",
  marseille: "Europe/Paris",
  nice: "Europe/Paris",
  bordeaux: "Europe/Paris",
  toulouse: "Europe/Paris",

  // UK
  london: "Europe/London",
  edinburgh: "Europe/London",
  manchester: "Europe/London",
  birmingham: "Europe/London",

  // Japan
  tokyo: "Asia/Tokyo",
  kyoto: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  hiroshima: "Asia/Tokyo",
  nara: "Asia/Tokyo",

  // US — East
  "new york": "America/New_York",
  nyc: "America/New_York",
  boston: "America/New_York",
  washington: "America/New_York",
  miami: "America/New_York",
  atlanta: "America/New_York",
  chicago: "America/Chicago",
  dallas: "America/Chicago",
  houston: "America/Chicago",

  // US — West
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  "las vegas": "America/Los_Angeles",
  portland: "America/Los_Angeles",

  // Southeast Asia
  bangkok: "Asia/Bangkok",
  "chiang mai": "Asia/Bangkok",
  singapore: "Asia/Singapore",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  bali: "Asia/Makassar",
  jakarta: "Asia/Jakarta",
  manila: "Asia/Manila",

  // Australia
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane",
  perth: "Australia/Perth",

  // Europe
  rome: "Europe/Rome",
  milan: "Europe/Rome",
  florence: "Europe/Rome",
  venice: "Europe/Rome",
  barcelona: "Europe/Madrid",
  madrid: "Europe/Madrid",
  amsterdam: "Europe/Amsterdam",
  berlin: "Europe/Berlin",
  munich: "Europe/Berlin",
  frankfurt: "Europe/Berlin",
  vienna: "Europe/Vienna",
  prague: "Europe/Prague",
  lisbon: "Europe/Lisbon",
  porto: "Europe/Lisbon",
  zurich: "Europe/Zurich",
  geneva: "Europe/Zurich",
  stockholm: "Europe/Stockholm",
  oslo: "Europe/Oslo",
  copenhagen: "Europe/Copenhagen",
  helsinki: "Europe/Helsinki",
  athens: "Europe/Athens",
  istanbul: "Europe/Istanbul",
  warsaw: "Europe/Warsaw",
  budapest: "Europe/Budapest",
  brussels: "Europe/Brussels",

  // Middle East
  dubai: "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  doha: "Asia/Qatar",
  riyadh: "Asia/Riyadh",
  "tel aviv": "Asia/Jerusalem",

  // South Asia
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  bangalore: "Asia/Kolkata",
  kolkata: "Asia/Kolkata",
  colombo: "Asia/Colombo",
  dhaka: "Asia/Dhaka",

  // East Asia
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong",
  taipei: "Asia/Taipei",
  seoul: "Asia/Seoul",

  // Default fallback
  default: "UTC",
};

export const COUNTRY_TIMEZONE: Record<string, string> = {
  japan: "Asia/Tokyo",
  thailand: "Asia/Bangkok",
  "south korea": "Asia/Seoul",
  singapore: "Asia/Singapore",
  australia: "Australia/Sydney",
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  italy: "Europe/Rome",
  spain: "Europe/Madrid",
  germany: "Europe/Berlin",
  netherlands: "Europe/Amsterdam",
  canada: "America/Toronto",
  mexico: "America/Mexico_City",
  indonesia: "Asia/Jakarta",
  malaysia: "Asia/Kuala_Lumpur",
  india: "Asia/Kolkata",
  china: "Asia/Shanghai",
  vietnam: "Asia/Ho_Chi_Minh",
  france: "Europe/Paris",
  "united states": "America/New_York",
  usa: "America/New_York",
};
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Get IANA timezone for a given trip destination string.
 * Performs case-insensitive prefix/contains matching.
 * Falls back to "UTC" if no match found.
 */
export function getTimezoneForDestination(destination?: string): string {
  if (!destination) return "UTC";

  const parts = destination.split(",").map((s) => s.toLowerCase().trim());
  const city = parts[0]?.replace(/[^a-z\s]/g, "").replace(/\s+/g, " ") ?? "";
  const country = parts[1]?.replace(/[^a-z\s]/g, "").replace(/\s+/g, " ") ?? "";

  // 1. City match (preferred)
  if (city && DESTINATION_TIMEZONE[city]) return DESTINATION_TIMEZONE[city]!;
  const cityKey = Object.keys(DESTINATION_TIMEZONE).find(
    (k) => k !== "default" && (city.includes(k) || k.includes(city)),
  );
  if (cityKey) return DESTINATION_TIMEZONE[cityKey]!;

  // 2. Country match (fallback for non-MVP destinations)
  if (country && COUNTRY_TIMEZONE[country]) return COUNTRY_TIMEZONE[country]!;
  const countryKey = Object.keys(COUNTRY_TIMEZONE).find(
    (k) => country.includes(k) || k.includes(country),
  );
  if (countryKey) return COUNTRY_TIMEZONE[countryKey]!;

  // 3. Use UTC only when nothing can be mapped
  return DESTINATION_TIMEZONE["default"] ?? "UTC";
}
