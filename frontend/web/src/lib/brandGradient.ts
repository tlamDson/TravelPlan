/**
 * The purple→orange "Pro" brand gradient, previously duplicated as a raw
 * Tailwind class string across ProBadge, UpgradeModal, DashboardPage and
 * CreateTripDialog. Centralizing here means Wave 1's billing/upgrade color
 * sweep (re-theming purple/orange into semantic tokens) only needs to
 * change one file, not four.
 */

/** Primary CTA button strength, with hover state. */
export const BRAND_GRADIENT_BUTTON =
  "bg-gradient-to-r from-purple-600 to-orange-500 text-white hover:from-purple-700 hover:to-orange-600";

/** Badge/small-decoration strength — lighter, no hover state. */
export const BRAND_GRADIENT_BADGE =
  "bg-gradient-to-r from-purple-500 to-orange-500";

/** Faded background wash behind a modal/card. */
export const BRAND_GRADIENT_WASH =
  "bg-gradient-to-br from-purple-600/20 via-transparent to-orange-500/20";
