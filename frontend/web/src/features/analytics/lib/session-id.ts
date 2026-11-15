export const SESSION_STORAGE_KEY = "tp_analytics_session_id";

/**
 * One analytics session per tab: sessionStorage survives reloads but not a
 * new tab. When storage is blocked the id lives in memory for this page.
 */
export function createSessionIdGetter(
  opts: { newId?: () => string } = {},
): () => string {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  let cached: string | null = null;

  return () => {
    if (cached) return cached;
    try {
      cached = sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      cached = null;
    }
    if (!cached) {
      cached = newId();
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, cached);
      } catch {
        // In-memory only.
      }
    }
    return cached;
  };
}
