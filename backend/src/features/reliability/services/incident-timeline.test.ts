import { describe, it, expect } from "vitest";
import { classifyReading, buildIncidentTimeline } from "./incident-timeline";

describe("classifyReading", () => {
  it("returns 'insufficient' when insufficientData is true, regardless of consumedRatio", () => {
    expect(
      classifyReading({ insufficientData: true }, { consumedRatio: 5 }),
    ).toBe("insufficient");
  });

  it("returns 'healthy' just under the warning ratio (0.7499)", () => {
    expect(
      classifyReading({ insufficientData: false }, { consumedRatio: 0.7499 }),
    ).toBe("healthy");
  });

  it("returns 'warning' at exactly the warning ratio (0.75)", () => {
    expect(
      classifyReading({ insufficientData: false }, { consumedRatio: 0.75 }),
    ).toBe("warning");
  });

  it("returns 'critical' at exactly the critical ratio (1)", () => {
    expect(
      classifyReading({ insufficientData: false }, { consumedRatio: 1 }),
    ).toBe("critical");
  });

  it("returns 'critical' when the budget is over-consumed (1.5)", () => {
    expect(
      classifyReading({ insufficientData: false }, { consumedRatio: 1.5 }),
    ).toBe("critical");
  });
});

describe("buildIncidentTimeline", () => {
  const now = new Date("2026-08-15T00:00:00.000Z");
  const incidentStart = new Date("2026-08-01T00:00:00.000Z");

  it("background count = backgroundWindowMs (in hours) * backgroundRatePerHour, hand-computed", () => {
    // 10 hours * 5/hour = 50 background records
    const timeline = buildIncidentTimeline({
      now,
      backgroundWindowMs: 10 * 60 * 60 * 1000,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs: 0,
    });
    const background = timeline.filter((i) =>
      i.jobId.startsWith("synthetic-bg-"),
    );
    expect(background).toHaveLength(50);
  });

  it("incident count = incidentDurationMs (in hours) * backgroundRatePerHour, hand-computed", () => {
    // 2 hours * 5/hour = 10 incident records
    const timeline = buildIncidentTimeline({
      now,
      backgroundWindowMs: 0,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs: 2 * 60 * 60 * 1000,
    });
    const incident = timeline.filter((i) =>
      i.jobId.startsWith("synthetic-incident-"),
    );
    expect(incident).toHaveLength(10);
  });

  it("every incident record has outcome 'fallback' — the gemini-2.0-flash outage shape", () => {
    const timeline = buildIncidentTimeline({
      now,
      backgroundWindowMs: 0,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs: 3 * 60 * 60 * 1000,
    });
    const incident = timeline.filter((i) =>
      i.jobId.startsWith("synthetic-incident-"),
    );
    expect(incident.length).toBeGreaterThan(0);
    for (const item of incident) {
      expect(item.outcome).toBe("fallback");
    }
  });

  it("incident finishedAt values fall within [incidentStart, incidentStart + incidentDurationMs]", () => {
    const incidentDurationMs = 4 * 60 * 60 * 1000;
    const timeline = buildIncidentTimeline({
      now,
      backgroundWindowMs: 0,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs,
    });
    const incident = timeline.filter((i) =>
      i.jobId.startsWith("synthetic-incident-"),
    );
    const incidentEnd = incidentStart.getTime() + incidentDurationMs;
    for (const item of incident) {
      expect(item.finishedAt.getTime()).toBeGreaterThanOrEqual(
        incidentStart.getTime(),
      );
      expect(item.finishedAt.getTime()).toBeLessThanOrEqual(incidentEnd);
    }
  });

  it("background finishedAt values fall within [now - backgroundWindowMs, now]", () => {
    const backgroundWindowMs = 6 * 60 * 60 * 1000;
    const timeline = buildIncidentTimeline({
      now,
      backgroundWindowMs,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs: 0,
    });
    const background = timeline.filter((i) =>
      i.jobId.startsWith("synthetic-bg-"),
    );
    for (const item of background) {
      expect(item.finishedAt.getTime()).toBeGreaterThanOrEqual(
        now.getTime() - backgroundWindowMs,
      );
      expect(item.finishedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("is fully reproducible with an injectable rand()", () => {
    let calls = 0;
    const sequence = [0.1, 0.9, 0.5, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.05];
    const rand = () => sequence[calls++ % sequence.length]!;

    const params = {
      now,
      backgroundWindowMs: 5 * 60 * 60 * 1000,
      backgroundRatePerHour: 5,
      incidentStart,
      incidentDurationMs: 2 * 60 * 60 * 1000,
      rand,
    };

    calls = 0;
    const runA = buildIncidentTimeline(params);
    calls = 0;
    const runB = buildIncidentTimeline(params);

    expect(runA).toEqual(runB);
  });
});
