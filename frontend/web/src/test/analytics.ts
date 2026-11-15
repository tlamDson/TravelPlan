import { expect } from "vitest";
import { buildClientEvent } from "@/features/analytics/lib/build-event";

/**
 * Checks every (name, properties) pair recorded on a mocked track() or
 * trackOnce() against the shared catalog, the same check the real client
 * runs before queueing. A refused event is never sent, so a call site that
 * fails here silently loses its data in production.
 */
export function expectCatalogValid(calls: unknown[][]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const [name, properties] of calls) {
    const result = buildClientEvent({
      eventId: "00000000-0000-4000-8000-000000000000",
      occurredAt: "2026-06-01T00:00:00.000Z",
      sessionId: "test-session",
      userId: null,
      name: String(name),
      properties,
    });
    expect(result, `${String(name)} fails the catalog`).toMatchObject({
      ok: true,
    });
  }
}
