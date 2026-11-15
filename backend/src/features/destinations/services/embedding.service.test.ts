import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * [Bug fix] `embedTexts()` used to fan out with a bare `Promise.all`, no
 * concurrency cap and no rate limiting — for a city with 15-30 entities
 * that's 15-30 simultaneous Gemini embedding requests. Found while seeding
 * the RAG corpus for the eval harness
 * (`.claude/plans/1-rag-eval-eventual-hickey.md`): 26 cities x up to 30
 * entities each is enough concurrent load to trip Gemini's rate limit and
 * burn through retries. `insight-worker.ts` already rate-limits at the
 * BullMQ job level (1 city / 2s), but within a single city's ~15-30
 * entities there was no cap at all.
 */

let concurrent = 0;
let maxConcurrent = 0;

const embedContent = vi.fn(async () => {
  concurrent++;
  maxConcurrent = Math.max(maxConcurrent, concurrent);
  await new Promise((r) => setTimeout(r, 5));
  concurrent--;
  return { embedding: { values: new Array(3072).fill(0) } };
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function GoogleGenerativeAI() {
    return { getGenerativeModel: () => ({ embedContent }) };
  }),
}));

describe("embedTexts concurrency cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    concurrent = 0;
    maxConcurrent = 0;
  });

  it("caps concurrent embedContent calls instead of firing all texts at once", async () => {
    const { embedTexts, EMBED_CONCURRENCY } =
      await import("./embedding.service");
    const texts = Array.from({ length: 12 }, (_, i) => `place ${i}`);

    const results = await embedTexts(texts);

    expect(results).toHaveLength(12);
    expect(maxConcurrent).toBeLessThanOrEqual(EMBED_CONCURRENCY);
    expect(maxConcurrent).toBeGreaterThan(1); // still parallel, not fully serial
  });

  it("preserves output order matching input order even when calls complete out of order", async () => {
    let call = 0;
    embedContent.mockImplementation(async () => {
      call += 1;
      const myCall = call;
      const delay = myCall % 2 === 0 ? 1 : 20; // alternate fast/slow completion
      await new Promise((r) => setTimeout(r, delay));
      return { embedding: { values: new Array(3072).fill(myCall) } };
    });

    const { embedTexts } = await import("./embedding.service");
    const texts = ["a", "b", "c", "d", "e", "f"];
    const results = await embedTexts(texts);

    // results[i] must correspond to the i-th dispatched call (1-indexed),
    // regardless of which one resolved first.
    expect(results.map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
