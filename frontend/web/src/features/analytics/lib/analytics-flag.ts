/**
 * Mirrors the server's ANALYTICS_ENABLED (`POST /api/analytics/events` is
 * mounted only when it is exactly "true"). Off by default, so a build whose
 * API does not mount the route never calls it. Read at call time so tests
 * can stub the variable.
 */
export function isAnalyticsEnabled(): boolean {
  return import.meta.env.VITE_ANALYTICS_ENABLED === "true";
}
