/**
 * Which exposures this tab has already sent. The server dedupes too (same
 * eventId per experiment, user and session), so this only saves requests:
 * one POST per experiment per analytics session. sessionStorage keeps the
 * claim across reloads; when it is blocked the claim lives in memory.
 */
export const EXPOSURE_STORAGE_PREFIX = "tp_exp_exposed:";

export interface ExposureClaim {
  experimentKey: string;
  sessionId: string;
  userId: string;
}

const claimed = new Set<string>();

function storageKey(c: ExposureClaim): string {
  return `${EXPOSURE_STORAGE_PREFIX}${c.sessionId}:${c.userId}:${c.experimentKey}`;
}

/** True the first time for this claim; false once it was claimed. */
export function claimExposure(claim: ExposureClaim): boolean {
  const key = storageKey(claim);
  if (claimed.has(key)) return false;
  try {
    if (sessionStorage.getItem(key) !== null) {
      claimed.add(key);
      return false;
    }
  } catch {
    // Storage blocked: memory only.
  }
  claimed.add(key);
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: memory only.
  }
  return true;
}

/** Undo a claim whose send failed, so a later render tries again. */
export function releaseExposure(claim: ExposureClaim): void {
  const key = storageKey(claim);
  claimed.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: memory only.
  }
}

export function resetExposureRegistryForTests(
  opts: { keepStorage?: boolean } = {},
): void {
  claimed.clear();
  if (opts.keepStorage) return;
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(EXPOSURE_STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage blocked: nothing stored.
  }
}
