import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

/**
 * [Guard] `insight-scraper.service.ts` hardcoded its own copy of the model
 * string instead of importing the shared `GEMINI_MODEL` pin from
 * `config/gemini-models.ts` — so when `gemini-2.0-flash` was confirmed dead
 * (404, see `ai-agent.service.test.ts`) and fixed in `ai-agent.service.ts`,
 * this file kept calling the dead model. Every RAG scraping job was
 * silently producing zero entities (`extractCityEntities` swallows the
 * Gemini error per-theme and just logs a warning), which meant
 * `PlaceInsight` never got populated — discovered while building the eval
 * harness in `.claude/plans/1-rag-eval-eventual-hickey.md`.
 *
 * [Bug fix, live incident 2026-08-22] Pinning to the *shared* `GEMINI_MODEL`
 * (same model `ai-agent.service.ts` uses for real trip generation) created
 * a second problem: Google's free-tier quota is per-model-per-project-per-day
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, verified live at
 * 20 requests/day for `gemini-3.6-flash` on this key). A single 26-city RAG
 * corpus seed needs ~78 generateContent calls — enqueuing it exhausted the
 * day's shared quota and would have started 429-ing real trip generation on
 * staging too, since both consumers hit the exact same model/quota bucket.
 * Now uses its own `GEMINI_INSIGHT_MODEL` — a separate model, separate
 * quota bucket, verified live and idempotent to bulk RAG scraping.
 */

vi.mock("axios");

const getGenerativeModel = vi.fn().mockReturnValue({
  generateContent: vi.fn().mockResolvedValue({
    response: { text: () => "[]" },
  }),
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function GoogleGenerativeAI() {
    return { getGenerativeModel };
  }),
}));

describe("insight-scraper.service model selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.post).mockResolvedValue({
      data: { organic: [{ snippet: "A great place to visit." }] },
    });
  });

  it("calls Gemini with its own GEMINI_INSIGHT_MODEL, not the dead gemini-2.0-flash", async () => {
    const { extractCityEntities } = await import("./insight-scraper.service");

    await extractCityEntities("Hanoi", "Vietnam");

    const usedModels = getGenerativeModel.mock.calls.map(
      (call) => (call[0] as { model: string }).model,
    );

    expect(usedModels.length).toBeGreaterThan(0);
    expect(usedModels).not.toContain("gemini-2.0-flash");
    expect(usedModels).not.toContain("gemini-2.5-flash");
    expect(usedModels.every((m) => m === "gemini-3.5-flash-lite")).toBe(true);
  });

  it("does NOT use GEMINI_MODEL (the model ai-agent.service.ts uses for real trip generation) — separate model means separate free-tier daily quota bucket", async () => {
    const { extractCityEntities } = await import("./insight-scraper.service");

    await extractCityEntities("Hanoi", "Vietnam");

    const usedModels = getGenerativeModel.mock.calls.map(
      (call) => (call[0] as { model: string }).model,
    );

    expect(usedModels).not.toContain("gemini-3.6-flash");
  });
});
