/// <reference types="vite/client" />

/**
 * Environment Variables Type Declarations
 *
 * Section 3.2: Type-safe environment variables
 */

interface ImportMetaEnv {
  /** API base URL */
  readonly VITE_API_URL: string;

  /** Clerk Publishable Key */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;

  /** Mapbox Access Token */
  readonly VITE_MAPBOX_ACCESS_TOKEN: string;

  /** Legacy Mapbox token key */
  readonly VITE_MAPBOX_TOKEN?: string;

  /** OpenWeather API key */
  readonly VITE_OPENWEATHER_API_KEY?: string;

  /** OpenWeather base URL override */
  readonly VITE_OPENWEATHER_BASE_URL?: string;

  /** Environment name */
  readonly VITE_ENV: "development" | "staging" | "production";

  /** Enable debug mode */
  readonly VITE_DEBUG?: string;

  /**
   * Show Google Calendar sync in production bundle (default off).
   */
  readonly VITE_ENABLE_GOOGLE_CALENDAR_SYNC?: string;

  /** Send analytics events to the API. Must match the server's ANALYTICS_ENABLED; exactly "true" turns it on, default off. */
  readonly VITE_ANALYTICS_ENABLED?: string;

  /** Comma-separated VIP emails for Calendar sync UI (client-visible). */
  readonly VITE_VIP_EMAILS?: string;

  /** Canonical site URL for Open Graph (no trailing slash). Optional on Vercel (uses VERCEL_URL). */
  readonly VITE_SITE_URL?: string;

  /** Path under public/ for og:image, default /images/countries/vietnam_image1.jpg */
  readonly VITE_OG_IMAGE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
