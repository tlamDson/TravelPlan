import { describe, it, expect, vi, beforeEach } from "vitest";
import { TripPreferencesSchema } from "@travelplan/shared";

/**
 * generateIntents()/generateIntentsWithRetry() used to return bare
 * TripIntents with no way for a caller to know how the generation actually
 * went (retries, token usage, latency) — trip.processor.ts's Trip.generationMeta
 * (.claude/plans/1-rag-eval-eventual-hickey.md Phase 5) needs that captured
 * at the source, not reconstructed after the fact. Separate file from
 * ai-agent.service.test.ts (the model-pin regression guard) because this
 * needs a fuller @google/generative-ai mock with a working generateContent.
 */

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function GoogleGenerativeAI() {
    return { getGenerativeModel };
  }),
}));

const preferences = TripPreferencesSchema.parse({
  destination: "Hanoi, Vietnam",
  startDate: new Date("2026-09-10").toISOString(),
  endDate: new Date("2026-09-11").toISOString(),
  budget: { total: 500, currency: "USD" },
});

function geminiResponse(intentsObj: unknown, usageMetadata?: unknown) {
  return {
    response: {
      text: () => JSON.stringify(intentsObj),
      ...(usageMetadata !== undefined ? { usageMetadata } : {}),
    },
  };
}

describe("AIAgentService.generateIntents — usage metadata capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures promptTokens/totalTokens/latencyMs from a successful call", async () => {
    generateContent.mockResolvedValue(
      geminiResponse(
        { day1: { morning: "Old Quarter" } },
        { promptTokenCount: 120, totalTokenCount: 150 },
      ),
    );

    const { AIAgentService } = await import("./ai-agent.service");
    const result = await new AIAgentService().generateIntents(preferences);

    expect(result.intents).toEqual({ day1: { morning: "Old Quarter" } });
    expect(result.promptTokens).toBe(120);
    expect(result.totalTokens).toBe(150);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns null token counts when the response carries no usageMetadata", async () => {
    generateContent.mockResolvedValue(
      geminiResponse({ day1: { morning: "Old Quarter" } }),
    );

    const { AIAgentService } = await import("./ai-agent.service");
    const result = await new AIAgentService().generateIntents(preferences);

    expect(result.promptTokens).toBeNull();
    expect(result.totalTokens).toBeNull();
  });
});

describe("AIAgentService.generateIntentsWithRetry — attempt counting + metadata passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("reports attempts: 1 and passes through the winning call's usage on first-try success", async () => {
    generateContent.mockResolvedValue(
      geminiResponse(
        { day1: { morning: "Old Quarter" } },
        { promptTokenCount: 10, totalTokenCount: 20 },
      ),
    );

    const { AIAgentService } = await import("./ai-agent.service");
    const promise = new AIAgentService().generateIntentsWithRetry(preferences);
    const result = await promise;

    expect(result.attempts).toBe(1);
    expect(result.promptTokens).toBe(10);
    expect(result.totalTokens).toBe(20);
    vi.useRealTimers();
  });

  it("reports the succeeding attempt number when an earlier attempt is unparseable", async () => {
    // A key that doesn't match /^day\s*0*(\d+)$/ (e.g. "notADay") gets
    // silently dropped by normalizeIntents(), not rejected — it normalizes
    // to {} which is a *valid* (empty) TripIntents per the Zod schema. Use
    // genuinely unparseable text instead, which parseIntents() throws on —
    // the realistic failure mode this retry loop exists for.
    generateContent
      .mockResolvedValueOnce({ response: { text: () => "not valid json {" } }) // attempt 1: throws in parseIntents
      .mockResolvedValueOnce(
        geminiResponse({ day1: { morning: "Old Quarter" } }),
      ); // attempt 2: valid

    const { AIAgentService } = await import("./ai-agent.service");
    const promise = new AIAgentService().generateIntentsWithRetry(
      preferences,
      undefined,
      undefined,
      4,
    );
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.attempts).toBe(2);
    vi.useRealTimers();
  });

  it("throws after exhausting maxRetries, never returning attempts > maxRetries", async () => {
    generateContent.mockResolvedValue({
      response: { text: () => "always unparseable {" },
    });

    const { AIAgentService } = await import("./ai-agent.service");
    const promise = new AIAgentService().generateIntentsWithRetry(
      preferences,
      undefined,
      undefined,
      2,
    );
    const assertion = expect(promise).rejects.toThrow(
      "AI failed to generate valid intents after 2 attempts",
    );
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});
