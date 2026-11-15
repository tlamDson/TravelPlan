import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  analyticsEventBatchSchema,
  analyticsEventSchema,
  analyticsIngestResultSchema,
  type AnalyticsEvent,
} from "../analytics.schema";

const goldenDir = resolve(__dirname, "../../../fixtures/golden-events");
const readJson = (rel: string) =>
  JSON.parse(readFileSync(resolve(goldenDir, rel), "utf8"));

describe("G-event golden: ingest-batch", () => {
  const input = readJson("ingest-batch/input.json");
  const truth = readJson("ingest-batch/truth.json");

  it("is a valid wire batch with one hand label per event", () => {
    expect(analyticsEventBatchSchema.safeParse(input).success).toBe(true);
    expect(truth.cases.map((c: { index: number }) => c.index)).toEqual(
      input.events.map((_: unknown, i: number) => i),
    );
    expect(analyticsIngestResultSchema.safeParse(truth.expected).success).toBe(
      true,
    );
  });

  it("schema verdict matches every hand label, with the issue at the labelled path", () => {
    const seen = new Set<string>();
    for (const c of truth.cases) {
      const result = analyticsEventSchema.safeParse(input.events[c.index]);
      if (c.outcome === "quarantined") {
        expect(result.success, `case ${c.index}`).toBe(false);
        const paths = result.error!.issues.map((i) => i.path.join("."));
        expect(paths, `case ${c.index}`).toContain(c.issuePath);
        continue;
      }
      expect(result.error?.issues, `case ${c.index}`).toBeUndefined();
      const id = result.data!.eventId;
      expect(seen.has(id), `case ${c.index}`).toBe(c.outcome === "duplicate");
      seen.add(id);
    }
  });

  it("hand totals agree with the per-case labels", () => {
    const count = (o: string) =>
      truth.cases.filter((c: { outcome: string }) => c.outcome === o).length;
    expect({
      received: truth.cases.length,
      accepted: count("accepted"),
      duplicates: count("duplicate"),
      quarantined: count("quarantined"),
    }).toEqual(truth.expected);
  });
});

describe("G-event golden: dau-funnel", () => {
  const log = readJson("dau-funnel/events.json");
  const truth = readJson("dau-funnel/truth.json");
  const events: AnalyticsEvent[] = log.events.map((e: unknown) =>
    analyticsEventSchema.parse(e),
  );

  it("every event in the log is valid and unique", () => {
    expect(new Set(events.map((e) => e.eventId)).size).toBe(events.length);
  });

  it("recomputed DAU (UTC dates, known users only) matches the hand value", () => {
    const byDay = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.userId === null) continue;
      const day = new Date(e.occurredAt).toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, new Set());
      byDay.get(day)!.add(e.userId);
    }
    const dau = Object.fromEntries(
      [...byDay].map(([day, users]) => [day, users.size]),
    );
    expect(dau).toEqual(truth.expected.dau);
  });

  it("recomputed ordered funnel matches the hand value", () => {
    const steps: string[] = truth.expected.funnel.steps;
    const sorted = [...events].sort(
      (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
    );
    const reached = new Map<string, number>();
    for (const e of sorted) {
      if (e.userId === null) continue;
      const next = reached.get(e.userId) ?? 0;
      if (steps[next] === e.name) reached.set(e.userId, next + 1);
    }
    const users = steps.map(
      (_, k) => [...reached.values()].filter((r) => r > k).length,
    );
    expect(users).toEqual(truth.expected.funnel.users);
  });
});
