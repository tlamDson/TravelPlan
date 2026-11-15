/**
 * Environment Variables Type Definitions
 *
 * Section 4.2: Secrets Management
 * - Provides type safety for import.meta.env
 * - NEVER expose API keys to client-side code
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ============================================
  // API Configuration
  // ============================================

  /** Backend API URL */
  readonly VITE_API_URL: string;

  /** API request timeout in ms */
  readonly VITE_API_TIMEOUT?: string;

  // ============================================
  // Feature Flags
  // ============================================

  /** Enable debug mode */
  readonly VITE_DEBUG?: string;

  /** Enable mock API responses */
  readonly VITE_MOCK_API?: string;

  /**
   * Show "Sync Google Calendar" in production builds (staging / internal testers).
   * Omit or false in public production — OAuth is limited to test accounts.
   */
  readonly VITE_ENABLE_GOOGLE_CALENDAR_SYNC?: string;

  /** Send analytics events to the API. Must match the server's ANALYTICS_ENABLED; exactly "true" turns it on, default off. */
  readonly VITE_ANALYTICS_ENABLED?: string;

  /** Comma-separated emails allowed to see Calendar sync (not secret — backend enforces). */
  readonly VITE_VIP_EMAILS?: string;

  readonly VITE_SITE_URL?: string;
  readonly VITE_OG_IMAGE_PATH?: string;

  // ============================================
  // Third-Party Services (PUBLIC KEYS ONLY)
  // Never expose secret keys!
  // ============================================

  /** Mapbox public access token */
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;

  /** Legacy Mapbox token key used by map hook */
  readonly VITE_MAPBOX_TOKEN?: string;

  /** Clerk publishable key (public) */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;



  // ============================================
  // FORBIDDEN - NEVER ADD THESE:
  // - VITE_GEMINI_API_KEY
  // - VITE_AWS_SECRET_KEY
  // - Any private/secret keys
  // Backend should handle all secret operations
  // ============================================
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
