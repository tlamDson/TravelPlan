import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_SCHEMA_VERSION,
  analyticsEventSchema,
  type AnalyticsEvent,
} from "@travelplan/shared";

/**
 * Why an event was refused. Carries the event name and the failing paths
 * only: never a value or an unknown key, since those may be the PII that
 * got the event refused.
 */
export interface InvalidEventReport {
  /** "unknown" when the name is not in the catalog. */
  name: string;
  issues: { code: string; path: string }[];
}

export type BuildEventResult =
  | { ok: true; event: AnalyticsEvent }
  | { ok: false; report: InvalidEventReport };

export interface EventInput {
  eventId: string;
  occurredAt: string;
  sessionId: string;
  userId: string | null;
  name: string;
  properties: unknown;
}

/** Events are JSON on the wire, so plain objects and arrays are all there is. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds a web event and checks it against the shared Zod catalog. The
 * catalog is strict, so an extra property (an email, a name) fails the whole
 * event instead of being sent. TypeScript alone cannot guarantee that: a
 * widened object, a cast or untyped code all get past the compiler.
 *
 * The result is a frozen snapshot: a retry or beacon resends exactly what
 * the first send carried under this eventId, whatever the caller does next.
 */
export function buildClientEvent(input: EventInput): BuildEventResult {
  const name = (ANALYTICS_EVENT_NAMES as readonly string[]).includes(input.name)
    ? input.name
    : "unknown";

  let properties: unknown;
  try {
    properties = JSON.parse(JSON.stringify(input.properties));
  } catch {
    return {
      ok: false,
      report: {
        name,
        issues: [{ code: "not_serializable", path: "properties" }],
      },
    };
  }

  const parsed = analyticsEventSchema.safeParse({
    eventId: input.eventId,
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    occurredAt: input.occurredAt,
    sessionId: input.sessionId,
    userId: input.userId,
    // Fixed here, so the server-only experiment_exposure can never pass.
    source: "web",
    name: input.name,
    properties,
  });
  if (!parsed.success) {
    return {
      ok: false,
      report: {
        name,
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join("."),
        })),
      },
    };
  }
  return { ok: true, event: deepFreeze(parsed.data) };
}
