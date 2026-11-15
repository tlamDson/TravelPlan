import { COUNTRIES, CITIES_BY_COUNTRY } from "../constants/destinations";

export function parseDestinationToCountryCity(savedDestination: string): {
  countryId: string;
  cityId?: string;
  freeTextCity?: string;
} {
  if (!savedDestination?.trim()) return { countryId: "" };

  const normalized = savedDestination.toLowerCase().trim();

  // 1. Check whether it matches an MVP city
  for (const [countryId, cities] of Object.entries(CITIES_BY_COUNTRY)) {
    const matchedCity = cities.find(
      (c) =>
        normalized === c.destinationValue.toLowerCase() ||
        normalized.includes(c.name.toLowerCase()) ||
        normalized.includes(c.nameEn.toLowerCase()),
    );

    if (matchedCity) {
      return { countryId, cityId: matchedCity.id };
    }
  }

  // 2. Not an MVP city: check whether it contains a known country name
  const matchedCountry = COUNTRIES.find(
    (c) =>
      normalized.includes(c.name.toLowerCase()) ||
      normalized.includes(c.nameEn.toLowerCase()),
  );

  if (matchedCountry) {
    // Take the city name before the comma (handles "Tokyo ,Japan", "Tokyo,Japan")
    const parts = savedDestination.split(/,\s*/);
    const freeText = parts[0]?.trim() ?? "";
    const isCityDifferent =
      freeText &&
      freeText.toLowerCase() !== matchedCountry.nameEn.toLowerCase() &&
      freeText.toLowerCase() !== matchedCountry.name.toLowerCase();
    return {
      countryId: matchedCountry.id,
      freeTextCity: isCityDifferent ? freeText : "",
    };
  }

  // 3. Fallback: no match → "Other" with the whole string as freeText
  return { countryId: "other", freeTextCity: savedDestination };
}
