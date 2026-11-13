/**
 * `pagehide` covers navigation and bfcache; `visibilitychange` to hidden is
 * the last reliable signal on mobile, where pagehide may never fire.
 * Returns an uninstall function.
 */
export function installUnloadFlush(client: {
  flushOnUnload(): void;
}): () => void {
  const onPageHide = () => client.flushOnUnload();
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") client.flushOnUnload();
  };

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
