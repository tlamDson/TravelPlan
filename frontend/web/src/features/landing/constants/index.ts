/**
 * Landing Page Constants
 *
 * Data for features, highlights, and other sections
 */

import { Sparkles, Map, DollarSign } from "lucide-react";

export const HERO_IMAGE =
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1920&q=80";

/** Copy lives in useTranslationStore under `landing.features.<key>.*`. */
export const FEATURES = [
  { icon: Sparkles, key: "ai" },
  { icon: Map, key: "maps" },
  { icon: DollarSign, key: "budget" },
];

/** Copy lives in useTranslationStore under `landing.steps.<key>.*`. */
export const STEPS = [
  { step: 1, key: "signup" },
  { step: 2, key: "plan" },
  { step: 3, key: "customize" },
  { step: 4, key: "travel" },
];

/** Copy lives in useTranslationStore under `landing.highlights.<key>.*`. */
export const WHY_TRAVELPLAN = [
  { key: "research" },
  { key: "places" },
  { key: "budget" },
];

export const DESTINATION_CARDS = [
  {
    city: "Paris",
    country: "France",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300",
    delay: 0,
    // Anchored to the edge of the centred text column (max-w-3xl = 48rem, so
    // 24rem from centre) plus a gap, so the card can never reach the text.
    position: "right-[calc(50%+25.5rem)] top-[28%]",
  },
  {
    city: "Tokyo",
    country: "Japan",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=300",
    delay: 1,
    position: "left-[calc(50%+25.5rem)] top-[40%]",
  },
  {
    city: "New York",
    country: "USA",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=300",
    delay: 2,
    position: "right-[calc(50%+25.5rem)] top-[58%]",
  },
];
