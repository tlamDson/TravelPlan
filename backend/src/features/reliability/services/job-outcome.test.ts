import { describe, it, expect } from "vitest";
import {
  toJobMetricInput,
  isTerminalFailure,
  normalizeFailureReason,
} from "./job-outcome";

const baseJob = {
  id: "job-1",
  name: "generate-trip",
  data: { tripId: "trip-1" },
  timestamp: 1000,
  processedOn: 1000,
  finishedOn: 2000,
  attemptsMade: 1,
  opts: { attempts: 3 },
};

describe("toJobMetricInput — outcome derivation (the FALLBACK honesty problem)", () => {
  it("returns 'fallback', NOT 'completed', when returnvalue.status is FALLBACK", () => {
    // trip.processor.ts's static-template path returns
    // { success: true, status: "FALLBACK" } — BullMQ itself reports this
    // job as `completed`. This is the headline test of the whole plan:
    // the outcome recorder must not trust BullMQ's own completed/failed
    // state, it must read the actual result.
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: { ...baseJob, returnvalue: { status: "FALLBACK" } },
      now: new Date(3000),
    });
    expect(input.outcome).toBe("fallback");
    expect(input.outcome).not.toBe("completed");
  });

  it("returns 'completed' when returnvalue.status is COMPLETED", () => {
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: { ...baseJob, returnvalue: { status: "COMPLETED" } },
      now: new Date(3000),
    });
    expect(input.outcome).toBe("completed");
  });

  it("returns 'failed' when an error is present, regardless of returnvalue", () => {
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: baseJob,
      error: new Error("boom"),
      now: new Date(3000),
    });
    expect(input.outcome).toBe("failed");
  });
});

describe("isTerminalFailure — the retry double-count problem", () => {
  it("is false when attemptsMade is below opts.attempts (still has retries left)", () => {
    // This is what RED-proves the bug: naively recording every `failed`
    // event double/triple-counts a job that ultimately succeeds after a
    // transient error.
    expect(isTerminalFailure({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(
      false,
    );
  });

  it("is true once attemptsMade reaches opts.attempts", () => {
    expect(isTerminalFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(
      true,
    );
  });

  it("is true when opts.attempts is undefined (BullMQ's 1-attempt default — e.g. sync-google-calendar)", () => {
    expect(isTerminalFailure({ attemptsMade: 1, opts: {} })).toBe(true);
  });

  it("is true when opts itself is undefined", () => {
    expect(isTerminalFailure({ attemptsMade: 1 })).toBe(true);
  });
});

describe("toJobMetricInput — latency windows", () => {
  it("computes queueWaitMs, processingMs, endToEndMs as three independent values", () => {
    // Asserted separately (not toEqual on the whole object) so a
    // copy-paste bug between the three fields would fail this test.
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: {
        ...baseJob,
        timestamp: 1000,
        processedOn: 5000,
        finishedOn: 9000,
        returnvalue: { status: "COMPLETED" },
      },
      now: new Date(20_000),
    });
    expect(input.queueWaitMs).toBe(4000);
    expect(input.processingMs).toBe(4000);
    expect(input.endToEndMs).toBe(8000);
  });

  it("falls back to the injected `now` when finishedOn is missing, never NaN or negative", () => {
    // finishedOn omitted entirely (not set to undefined) — matches the
    // real shape of an in-flight bullmq Job before BullMQ populates it.
    const { finishedOn: _finishedOn, ...jobWithoutFinishedOn } = baseJob;
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: {
        ...jobWithoutFinishedOn,
        timestamp: 1000,
        processedOn: 1500,
        returnvalue: { status: "COMPLETED" },
      },
      now: new Date(4000),
    });
    expect(Number.isNaN(input.endToEndMs)).toBe(false);
    expect(input.endToEndMs).toBeGreaterThanOrEqual(0);
    expect(input.endToEndMs).toBe(3000); // 4000 (now) - 1000 (timestamp)
  });

  it("falls back to timestamp when processedOn is missing, never NaN or negative", () => {
    const { processedOn: _processedOn, ...jobWithoutProcessedOn } = baseJob;
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: {
        ...jobWithoutProcessedOn,
        timestamp: 1000,
        finishedOn: 2500,
        returnvalue: { status: "COMPLETED" },
      },
      now: new Date(5000),
    });
    expect(Number.isNaN(input.queueWaitMs)).toBe(false);
    expect(input.queueWaitMs).toBeGreaterThanOrEqual(0);
    expect(input.queueWaitMs).toBe(0);
  });
});

describe("toJobMetricInput — carries jobId/jobName/tripId/attemptsMade through", () => {
  it("copies the identifying fields verbatim", () => {
    const input = toJobMetricInput({
      queue: "trip-generation",
      job: { ...baseJob, returnvalue: { status: "COMPLETED" } },
      now: new Date(3000),
    });
    expect(input.jobId).toBe("job-1");
    expect(input.jobName).toBe("generate-trip");
    expect(input.tripId).toBe("trip-1");
    expect(input.attemptsMade).toBe(1);
    expect(input.queue).toBe("trip-generation");
  });

  it("omits tripId when the job has no data.tripId (e.g. an insight-scraper job)", () => {
    const { data: _data, ...jobWithoutData } = baseJob;
    const input = toJobMetricInput({
      queue: "insight-scraper",
      job: {
        ...jobWithoutData,
        returnvalue: { status: "COMPLETED" },
      },
      now: new Date(3000),
    });
    expect(input.tripId).toBeUndefined();
  });
});

describe("normalizeFailureReason", () => {
  it("truncates a long raw message to 200 chars", () => {
    const longMessage = "x".repeat(3000);
    const { message } = normalizeFailureReason(new Error(longMessage));
    expect(message.length).toBeLessThanOrEqual(200);
  });

  it("redacts an API key carried in a query string — this collection is exposed via HTTP in a later phase", () => {
    const { message } = normalizeFailureReason(
      new Error(
        "Request failed: https://places.googleapis.com/v1/places?key=AIzaSyD-realsecretvalue123",
      ),
    );
    expect(message).not.toContain("AIzaSyD-realsecretvalue123");
    expect(message).toContain("key=[REDACTED]");
  });

  it("redacts a Bearer token", () => {
    const { message } = normalizeFailureReason(
      new Error("401 Unauthorized: Bearer sk-real-secret-token-value"),
    );
    expect(message).not.toContain("sk-real-secret-token-value");
    expect(message).toContain("Bearer [REDACTED]");
  });

  it("maps a timeout-shaped message to AI_TIMEOUT", () => {
    const { code } = normalizeFailureReason(
      new Error("Gemini request timeout after 30s"),
    );
    expect(code).toBe("AI_TIMEOUT");
  });

  it("maps a quota/429-shaped message to AI_QUOTA", () => {
    const { code } = normalizeFailureReason(
      new Error("429 Too Many Requests: quota exceeded"),
    );
    expect(code).toBe("AI_QUOTA");
  });

  it("maps an unrecognized message to UNKNOWN rather than throwing", () => {
    const { code } = normalizeFailureReason(
      new Error("something totally unexpected"),
    );
    expect(code).toBe("UNKNOWN");
  });

  // [BUG] Verified against a real load-test run (npm run measure:achieved-slo,
  // 2026-09-13): every one of the 8 real `failed` outcomes recorded carried
  // this exact message from ai-agent.service.ts's retry-exhaustion path, yet
  // all 8 landed as failureReason=UNKNOWN — even though the run's timing
  // (retries exhausted right as the Gemini free-tier daily quota wall was
  // hit) strongly suggests the underlying cause was AI_QUOTA. The message
  // never surfaces "429"/"quota"/"rate limit" itself (ai-agent.service.ts
  // wraps the real Gemini error before re-throwing this generic one), so no
  // FAILURE_PATTERNS regex matches it. This isn't a crash, just a lost
  // diagnostic signal: countByFailureReason()'s breakdown can't distinguish
  // "AI is quota-exhausted" from "AI is genuinely broken" for this message
  // shape, which is the single most common real failure mode observed.
  it("[BUG] maps the real 'AI failed to generate valid intents' retry-exhaustion message to UNKNOWN, even though it usually means AI_QUOTA", () => {
    const { code } = normalizeFailureReason(
      new Error("AI failed to generate valid intents after 4 attempts"),
    );
    expect(code).toBe("UNKNOWN");
  });

  it("handles a non-Error thrown value without throwing itself", () => {
    expect(() => normalizeFailureReason("a plain string error")).not.toThrow();
    const { code } = normalizeFailureReason("a plain string error");
    expect(code).toBe("UNKNOWN");
  });
});
