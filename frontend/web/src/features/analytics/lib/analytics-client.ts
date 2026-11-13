import {
  ANALYTICS_BATCH_MAX_EVENTS,
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEvent,
} from "@travelplan/shared";

/** Events the browser may emit; exposure is written by the server only. */
export type ClientEvent = Exclude<
  AnalyticsEvent,
  { name: "experiment_exposure" }
>;
export type ClientEventName = ClientEvent["name"];
export type ClientEventProperties<N extends ClientEventName> = Extract<
  ClientEvent,
  { name: N }
>["properties"];

export type SendResult =
  { ok: true } | { ok: false; retryable: boolean; status?: number };

export interface AnalyticsTransport {
  send(
    events: AnalyticsEvent[],
    opts?: { keepalive?: boolean },
  ): Promise<SendResult>;
  /** Hands the batch to the browser; false when it refused to queue it. */
  beacon(events: AnalyticsEvent[]): boolean;
}

export type DropReason = "queue_full" | "max_attempts" | "rejected";

export interface AnalyticsClientOptions {
  transport: AnalyticsTransport;
  getSessionId: () => string;
  newId?: () => string;
  now?: () => Date;
  /** Clamped to [1, ANALYTICS_BATCH_MAX_EVENTS]. */
  batchSize?: number;
  flushIntervalMs?: number;
  /** Total sends per batch, the first one included. */
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxQueueSize?: number;
  onDrop?: (events: AnalyticsEvent[], reason: DropReason) => void;
}

export interface AnalyticsClient {
  track<N extends ClientEventName>(
    name: N,
    properties: ClientEventProperties<N>,
  ): void;
  identify(userId: string | null): void;
  /** Sends the next batch now, unless one is in flight or waiting to retry. */
  flush(): Promise<void>;
  /** Page is going away: beacon everything not yet acknowledged. */
  flushOnUnload(): void;
  pendingCount(): number;
}

export function createAnalyticsClient(
  opts: AnalyticsClientOptions,
): AnalyticsClient {
  const {
    transport,
    getSessionId,
    newId = () => crypto.randomUUID(),
    now = () => new Date(),
    flushIntervalMs = 5_000,
    maxAttempts = 5,
    baseBackoffMs = 1_000,
    maxBackoffMs = 30_000,
    maxQueueSize = 500,
    onDrop = () => {},
  } = opts;
  const batchSize = Math.min(
    Math.max(1, opts.batchSize ?? 20),
    ANALYTICS_BATCH_MAX_EVENTS,
  );

  let userId: string | null = null;
  let queue: AnalyticsEvent[] = [];
  /** A failed batch keeps its events (and eventIds) until it is resent. */
  let retryBatch: AnalyticsEvent[] | null = null;
  let inFlight: AnalyticsEvent[] | null = null;
  let inFlightPromise: Promise<void> | null = null;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waitingForRetry = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    waitingForRetry = false;
  };

  const schedule = (ms: number, isRetry: boolean) => {
    clearTimer();
    waitingForRetry = isRetry;
    timer = setTimeout(() => {
      timer = null;
      waitingForRetry = false;
      void flush();
    }, ms);
  };

  const afterSettled = () => {
    if (retryBatch) return;
    if (queue.length >= batchSize) void flush();
    else if (queue.length > 0 && timer === null)
      schedule(flushIntervalMs, false);
  };

  const handleResult = (batch: AnalyticsEvent[], result: SendResult) => {
    if (result.ok) {
      failures = 0;
      return;
    }
    if (result.retryable && failures + 1 < maxAttempts) {
      failures += 1;
      retryBatch = batch;
      schedule(
        Math.min(maxBackoffMs, baseBackoffMs * 2 ** (failures - 1)),
        true,
      );
      return;
    }
    failures = 0;
    onDrop(batch, result.retryable ? "max_attempts" : "rejected");
  };

  const sendBatch = async (batch: AnalyticsEvent[]) => {
    let result: SendResult;
    try {
      result = await transport.send(batch);
    } catch {
      result = { ok: false, retryable: true };
    }
    inFlight = null;
    inFlightPromise = null;
    handleResult(batch, result);
    afterSettled();
  };

  function flush(): Promise<void> {
    if (inFlightPromise) return inFlightPromise;
    if (waitingForRetry) return Promise.resolve();
    const batch = retryBatch ?? queue.splice(0, batchSize);
    retryBatch = null;
    if (batch.length === 0) return Promise.resolve();
    clearTimer();
    inFlight = batch;
    inFlightPromise = sendBatch(batch);
    return inFlightPromise;
  }

  return {
    track(name, properties) {
      queue.push({
        eventId: newId(),
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        occurredAt: now().toISOString(),
        sessionId: getSessionId(),
        userId,
        source: "web",
        name,
        properties,
      } as ClientEvent);
      if (queue.length > maxQueueSize) {
        onDrop(queue.splice(0, queue.length - maxQueueSize), "queue_full");
      }
      if (inFlightPromise || waitingForRetry) return;
      if (queue.length >= batchSize) void flush();
      else if (timer === null) schedule(flushIntervalMs, false);
    },

    identify(id) {
      userId = id;
    },

    flush,

    flushOnUnload() {
      // The in-flight batch may still land; resending it is safe because
      // the server dedupes on eventId.
      const pending = [...(inFlight ?? []), ...(retryBatch ?? []), ...queue];
      clearTimer();
      queue = [];
      retryBatch = null;
      failures = 0;
      for (let i = 0; i < pending.length; i += ANALYTICS_BATCH_MAX_EVENTS) {
        const chunk = pending.slice(i, i + ANALYTICS_BATCH_MAX_EVENTS);
        if (!transport.beacon(chunk)) {
          void transport.send(chunk, { keepalive: true }).catch(() => {});
        }
      }
    },

    pendingCount() {
      return queue.length + (retryBatch?.length ?? 0);
    },
  };
}
