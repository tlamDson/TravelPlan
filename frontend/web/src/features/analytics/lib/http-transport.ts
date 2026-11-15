import type { AnalyticsEvent } from "@travelplan/shared";
import type { AnalyticsTransport, SendResult } from "./analytics-client";

type SendBeacon = (url: string, data: BodyInit) => boolean;

export interface HttpTransportOptions {
  url: string;
  fetchImpl?: typeof fetch;
  /** null when the browser has no sendBeacon. */
  sendBeacon?: SendBeacon | null;
  getToken?: () => Promise<string | null>;
}

function defaultSendBeacon(): SendBeacon | null {
  if (typeof navigator === "undefined") return null;
  if (typeof navigator.sendBeacon !== "function") return null;
  return (url, data) => navigator.sendBeacon(url, data);
}

/**
 * Talks to `POST /api/analytics/events` with plain fetch rather than the
 * shared axios client: its 401 interceptor redirects to /signin, which an
 * analytics call must never do.
 */
export function createHttpTransport(
  opts: HttpTransportOptions,
): AnalyticsTransport {
  const { url, getToken } = opts;
  const fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
  const sendBeacon =
    opts.sendBeacon === undefined ? defaultSendBeacon() : opts.sendBeacon;

  return {
    async send(events, sendOpts): Promise<SendResult> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (getToken) {
        try {
          const token = await getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
          // Send anonymously; the envelope still carries userId.
        }
      }
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ events }),
          credentials: "include",
          keepalive: sendOpts?.keepalive ?? false,
        });
        if (res.ok) return { ok: true };
        const retryable = res.status === 429 || res.status >= 500;
        return { ok: false, retryable, status: res.status };
      } catch {
        return { ok: false, retryable: true };
      }
    },

    beacon(events: AnalyticsEvent[]) {
      if (!sendBeacon) return false;
      // text/plain is CORS-safelisted, so the cross-origin beacon needs no
      // preflight (which sendBeacon cannot do reliably).
      const body = new Blob([JSON.stringify({ events })], {
        type: "text/plain;charset=utf-8",
      });
      try {
        return sendBeacon(url, body);
      } catch {
        return false;
      }
    },
  };
}
