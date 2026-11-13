import { API_URL } from "@/config/env";
import { createBrowserLogger } from "@/lib/logger";
import {
  createAnalyticsClient,
  type AnalyticsClient,
  type ClientEventName,
  type ClientEventProperties,
} from "./lib/analytics-client";
import { createHttpTransport } from "./lib/http-transport";
import { createSessionIdGetter } from "./lib/session-id";
import { installUnloadFlush } from "./lib/unload-flush";

const logger = createBrowserLogger("analytics");

let client: AnalyticsClient | null = null;
let uninstall: (() => void) | null = null;

/** Created on first use, so pages that never track add no listeners. */
function getClient(): AnalyticsClient {
  if (!client) {
    client = createAnalyticsClient({
      transport: createHttpTransport({ url: `${API_URL}/analytics/events` }),
      getSessionId: createSessionIdGetter(),
      onDrop: (events, reason) =>
        logger.warn(
          { count: events.length, reason },
          "analytics events dropped",
        ),
      // The report holds the event name and failing paths, never values.
      onInvalid: (report) =>
        logger.warn(report, "analytics event failed the catalog, not sent"),
    });
    uninstall = installUnloadFlush(client);
  }
  return client;
}

export function track<N extends ClientEventName>(
  name: N,
  properties: ClientEventProperties<N>,
): void {
  getClient().track(name, properties);
}

/** Pass the Clerk userId after sign-in, null after sign-out. */
export function identify(userId: string | null): void {
  getClient().identify(userId);
}

export function resetAnalyticsForTests(): void {
  uninstall?.();
  uninstall = null;
  client = null;
}
