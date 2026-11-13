/**
 * Maps a trip title to a country image from `/images/countries/`.
 * The trip title follows the pattern: "Trip to {destination}"
 * where destination is something like "Paris, France" or "Ho Chi Minh, Vietnam".
 */

type CountryKey = "vietnam" | "america" | "france";

const COUNTRY_KEYWORDS: Record<CountryKey, string[]> = {
  vietnam: [
    "vietnam",
    "vnam",
    "việt nam",
    "viet nam",
    "hanoi",
    "ha noi",
    "hà nội",
    "ho chi minh",
    "hcm",
    "hcmc",
    "hồ chí minh",
    "saigon",
    "sài gòn",
    "da nang",
    "đà nẵng",
    "hoi an",
    "hội an",
    "nha trang",
    "phu quoc",
    "phú quốc",
    "hue",
    "huế",
    "da lat",
    "đà lạt",
    "sapa",
    "sa pa",
    "halong",
    "ha long",
    "hạ long",
    "can tho",
    "cần thơ",
    "vung tau",
    "vũng tàu",
  ],
  america: [
    "united states",
    "usa",
    "u.s.a",
    "america",
    "new york",
    "los angeles",
    "san francisco",
    "chicago",
    "miami",
    "las vegas",
    "washington",
    "boston",
    "seattle",
    "houston",
    "phoenix",
    "philadelphia",
    "san diego",
    "dallas",
    "austin",
    "denver",
    "atlanta",
    "portland",
    "orlando",
    "nashville",
    "hawaii",
    "mỹ",
    "hoa kỳ",
  ],
  france: [
    "france",
    "paris",
    "lyon",
    "marseille",
    "nice",
    "toulouse",
    "bordeaux",
    "strasbourg",
    "nantes",
    "montpellier",
    "lille",
    "provence",
    "normandy",
    "normandie",
    "versailles",
    "cannes",
    "monaco",
    "avignon",
    "pháp",
  ],
};

// Exact filenames from /images/countries/
const COUNTRY_IMAGES: Record<CountryKey, string[]> = {
  vietnam: [
    "/images/countries/vietnam_image1.jpg",
    "/images/countries/vietnam_image2.webp",
    "/images/countries/vietnam_image3.jpg",
    "/images/countries/vietnam_image4.jpg",
    "/images/countries/vietnam_image5.jpg",
    "/images/countries/vietnam_image6.jpg",
    "/images/countries/vietnam_image7.jpg",
    "/images/countries/vietnam_image8.jpg",
    "/images/countries/vietnam_image9.jpg",
    "/images/countries/vietnam_image10.jpg",
    "/images/countries/vietnam_image11.jpg",
  ],
  america: [
    "/images/countries/america_image1.jpg",
    "/images/countries/america_image2.jpg",
    "/images/countries/america_image3.png",
    "/images/countries/america_image4.jpg",
    "/images/countries/america_image5.avif",
    "/images/countries/america_image6.jpeg",
    "/images/countries/america_image7.jpg",
    "/images/countries/america_image8.jpg",
    "/images/countries/america_image9.jpg",
    "/images/countries/america_image10.jpg",
  ],
  france: [
    "/images/countries/france_image1.jpeg",
    "/images/countries/france_image2.jpg",
    "/images/countries/france_image5.webp",
    "/images/countries/france_image6.webp",
    "/images/countries/france_image7.webp",
    "/images/countries/france_image8.webp",
    "/images/countries/france_image9.webp",
    "/images/countries/france_image10.webp",
    "/images/countries/france_image11.webp",
    "/images/countries/france_image12.webp",
  ],
};

function hashIndex(
  seedString: string | undefined,
  fallback: string,
  length: number,
) {
  if (!seedString) return fallback.length % length;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word match so "usa" does not hit "Busan" and "nice" does not hit "Venice".
function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(text);
}

/**
 * Detects the country from a destination/trip title string and returns an
 * image path for that country, or null when the country is unknown or has no
 * images (callers render a neutral placeholder; never another country's photo).
 * Selection is deterministic: the same seed (e.g. trip id) gives the same image.
 */
export function getCountryImage(
  tripTitle: string | null | undefined,
  seedString?: string,
): string | null {
  if (!tripTitle) return null;
  const lower = tripTitle.toLowerCase();

  for (const [country, keywords] of Object.entries(COUNTRY_KEYWORDS)) {
    if (keywords.some((kw) => containsKeyword(lower, kw))) {
      const images = COUNTRY_IMAGES[country as CountryKey];
      return images[hashIndex(seedString, tripTitle, images.length)];
    }
  }

  return null;
}
