import { API_URL } from "@/config/env";
import { createBrowserLogger } from "@/lib/logger";
import {
  createAnalyticsClient,
  type AnalyticsClient,
  type ClientEventName,
  type ClientEventProperties,
} from "./lib/analytics-client";
import { isAnalyticsEnabled } from "./lib/analytics-flag";
import { createHttpTransport } from "./lib/http-transport";
import { createSessionIdGetter } from "./lib/session-id";
import { installUnloadFlush } from "./lib/unload-flush";

const logger = createBrowserLogger("analytics");

let client: AnalyticsClient | null = null;
let sessionIdGetter: (() => string) | null = null;
let uninstall: (() => void) | null = null;
/** "name:key" pairs already sent by trackOnce() during this page load. */
const sentOnce = new Set<string>();

/** Created on first use, so pages that never track add no listeners. */
function getClient(): AnalyticsClient {
  if (!client) {
    client = createAnalyticsClient({
      transport: createHttpTransport({ url: `${API_URL}/analytics/events` }),
      getSessionId: getAnalyticsSessionId,
      // Debug only: analytics must never add console noise for users.
      onDrop: (events, reason) =>
        logger.debug(`analytics: dropped ${events.length} event(s): ${reason}`),
      // The report holds the event name and failing paths, never values.
      onInvalid: (report) =>
        logger.debug(
          `analytics: event "${report.name}" failed the catalog, not sent (${report.issues
            .map((i) => `${i.path}: ${i.code}`)
            .join(", ")})`,
        ),
    });
    uninstall = installUnloadFlush(client);
  }
  return client;
}

/**
 * This tab's analytics session id, the one every tracked event carries.
 * Server-side events for the same session (experiment exposures) use it
 * so they join the client events.
 */
export function getAnalyticsSessionId(): string {
  sessionIdGetter ??= createSessionIdGetter();
  return sessionIdGetter();
}

export function track<N extends ClientEventName>(
  name: N,
  properties: ClientEventProperties<N>,
): void {
  if (!isAnalyticsEnabled()) return;
  getClient().track(name, properties);
}

/**
 * Tracks an event at most once per key for the life of the page. For
 * signals the UI can see more than once, such as a polled job that reaches
 * a final state again after a remount.
 */
export function trackOnce<N extends ClientEventName>(
  name: N,
  properties: ClientEventProperties<N>,
  key: string,
): void {
  const onceKey = `${name}:${key}`;
  if (sentOnce.has(onceKey)) return;
  sentOnce.add(onceKey);
  track(name, properties);
}

/** Pass the Clerk userId after sign-in, null after sign-out. */
export function identify(userId: string | null): void {
  if (!isAnalyticsEnabled()) return;
  getClient().identify(userId);
}

export function resetAnalyticsForTests(): void {
  uninstall?.();
  uninstall = null;
  client = null;
  sessionIdGetter = null;
  sentOnce.clear();
}
