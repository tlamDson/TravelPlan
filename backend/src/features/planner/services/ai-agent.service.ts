import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../../config/env";
import { GEMINI_MODEL } from "../../../config/gemini-models";
import { logger } from "../../../lib/logger";
import type { TripPreferences } from "@travelplan/shared";
import {
  buildTripPrompt,
  TRIP_PLANNER_SYSTEM_INSTRUCTION,
} from "../prompts/trip-generation.prompt";
import { intentParserService, type TripIntents } from "./intent-parser.service";

/** Token/latency usage for a single generateContent call — captured so
 * trip.processor.ts can persist it on Trip.generationMeta instead of it
 * only ever existing in a log line. */
export interface AIUsage {
  promptTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
}

export interface GenerateIntentsResult extends AIUsage {
  intents: TripIntents;
}

export interface GenerateIntentsRetryResult extends AIUsage {
  intents: TripIntents;
  /** Which attempt (1-indexed) actually succeeded. */
  attempts: number;
}

export class AIAgentService {
  private model: any;
  /**
   * rawModel: same Gemini model but WITHOUT systemInstruction.
   * Used for supplementary/regen queries that need a plain JSON array response.
   *
   * WHY: The trip-generation systemInstruction forces the model to ALWAYS output
   * { "day1": { "morning": [...] } } format. When we ask for ["query1", "query2"],
   * the model ignores our request and outputs the structured object — the
   * JSON array regex then fails to parse it, returning [] silently.
   * A raw model with no systemInstruction follows the user-turn prompt faithfully.
   */
  private rawModel: any;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      logger.warn("Gemini API key not configured, AI generation will fail");
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      this.model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        // System instruction = persona + rules (higher compliance than user turn)
        systemInstruction: TRIP_PLANNER_SYSTEM_INSTRUCTION,
      });
      // No systemInstruction — accepts ad-hoc prompts and returns exactly what's requested
      this.rawModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
      logger.info(
        "✅ [AI] Both model (with system instruction) and rawModel initialized",
      );
    } catch (error: any) {
      logger.error(
        { error: error.message },
        "Failed to initialize Gemini client",
      );
    }
  }

  async generateIntents(
    preferences: TripPreferences,
    language?: string,
    cityCost?: any,
    localInsight?: string | null,
  ): Promise<GenerateIntentsResult> {
    if (!this.model) {
      logger.error(
        { hasApiKey: !!env.GEMINI_API_KEY },
        "❌ Gemini client not initialized - check GEMINI_API_KEY environment variable",
      );
      throw new Error(
        "Gemini client not initialized - GEMINI_API_KEY is missing or invalid",
      );
    }

    const prompt = buildTripPrompt(
      preferences,
      language,
      cityCost,
      localInsight,
    );

    logger.info(
      {
        destination: preferences.destination,
        budgetPerDay:
          prompt.match(/Budget: \$([0-9.]+)\/person\/day/)?.[1] || "unknown",
        promptCostContext: cityCost
          ? `Min ${cityCost.accommodationType ?? "any"}: ~$${cityCost.minHotelUSD}, Meals: ~$${cityCost.minFoodUSD}`
          : "None",
      },
      "🤖 Generating intents with Gemini (Prompt built)",
    );

    // 📌 LOG POINT: Print the exact text instructing Gemini on budgets so DEV can verify in terminal/docker
    logger.debug(
      { aiPrompt: prompt },
      "🔍 [DEV] Full AI Prompt generated (includes cost and budget instructions)",
    );

    try {
      const startedAt = Date.now();
      const result = await this.model.generateContent(prompt);
      const latencyMs = Date.now() - startedAt;
      const text = result.response.text();

      // 📌 LOG POINT A — full raw text from Gemini (before any parsing)
      logger.info(
        {
          responseLength: text.length,
          rawGeminiOutput: text, // full JSON string Gemini returned
        },
        "✅ [GEMINI RAW] Full response received",
      );

      const intents = intentParserService.parseIntents(text);

      // 📌 LOG POINT B — structured intents after parsing (day1/day2... → morning/afternoon/evening)
      logger.info(
        { parsedIntents: intents },
        "✅ [GEMINI PARSED] Structured intents (search queries per day/slot)",
      );

      // usageMetadata is absent on some SDK/mock responses — never let a
      // missing field crash generation, just report it as unknown.
      const usage = result.response.usageMetadata;
      return {
        intents,
        promptTokens: usage?.promptTokenCount ?? null,
        totalTokens: usage?.totalTokenCount ?? null,
        latencyMs,
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, stack: error.stack },
        "❌ Gemini API call failed",
      );
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Called when validation yield < total slots needed.
  // Returns an array of raw search query strings (not day/slot structured).
  async generateSupplementaryQueries(
    count: number,
    destination: string,
    existingPlaceNames: string[],
  ): Promise<string[]> {
    // rawModel MUST be used here — this.model has a systemInstruction that forces
    // structured { day1: { morning: [...] } } output and will ignore the plain array request.
    if (!this.rawModel) {
      logger.warn(
        { destination },
        "⚠️ [REGEN] rawModel not initialized — GEMINI_API_KEY missing?",
      );
      return [];
    }

    const avoidList =
      existingPlaceNames.length > 0
        ? `Avoid suggesting: ${existingPlaceNames.slice(0, 20).join(", ")}.`
        : "";

    const prompt =
      `Generate exactly ${count} specific location search queries for places to visit in ${destination}. ` +
      `Each query must name a real district, landmark, or neighborhood in ${destination}. ` +
      `${avoidList} ` +
      `Return ONLY a valid JSON array of strings, no markdown, no explanation. Example: ["Hoan Kiem Lake Hanoi", "Old Quarter Hanoi"]`;

    try {
      const result = await this.rawModel.generateContent(prompt);
      const text: string = result.response.text();

      logger.info(
        { destination, count, rawText: text.slice(0, 300) },
        "🔍 [REGEN] Raw Gemini response for supplementary queries",
      );

      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        logger.warn(
          { destination, rawText: text.slice(0, 200) },
          "⚠️ [REGEN] No JSON array found in Gemini response",
        );
        return [];
      }

      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        logger.warn(
          { destination, matched: jsonMatch[0].slice(0, 100) },
          "⚠️ [REGEN] Parsed value is not an array",
        );
        return [];
      }

      const results = (parsed as unknown[])
        .filter(
          (q): q is string => typeof q === "string" && q.trim().length > 0,
        )
        .slice(0, count);

      logger.info(
        { destination, results },
        "✅ [REGEN] Supplementary queries parsed",
      );
      return results;
    } catch (error: any) {
      logger.warn(
        { error: error.message, destination, count },
        "⚠️ Supplementary query generation failed — continuing without fill",
      );
      return [];
    }
  }

  /**
   * Run an arbitrary prompt and parse the response as a JSON string array.
   * Used by ActivityRegenService for hint-aware queries.
   * Must use rawModel (no systemInstruction) so the plain array format is respected.
   */
  async generateSupplementaryQueriesRaw(prompt: string): Promise<string[]> {
    if (!this.rawModel) {
      logger.warn("⚠️ [REGEN-RAW] rawModel not initialized");
      return [];
    }
    try {
      const result = await this.rawModel.generateContent(prompt);
      const text: string = result.response.text();

      logger.info(
        { rawText: text.slice(0, 300) },
        "🔍 [REGEN-RAW] Raw Gemini response",
      );

      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        logger.warn(
          { rawText: text.slice(0, 200) },
          "⚠️ [REGEN-RAW] No JSON array in response",
        );
        return [];
      }
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      return (parsed as unknown[]).filter(
        (q): q is string => typeof q === "string" && q.trim().length > 0,
      );
    } catch (error: any) {
      logger.warn(
        { error: error.message },
        "⚠️ [REGEN-RAW] Failed to generate",
      );
      return [];
    }
  }

  async generateIntentsWithRetry(
    preferences: TripPreferences,
    language?: string,
    cityCost?: any,
    maxRetries = 4,
    localInsight?: string | null,
  ): Promise<GenerateIntentsRetryResult> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Wait before retrying (skip delay on first attempt)
        if (i > 0) {
          const waitMs = 2000 * i; // 2s, 4s, 6s
          logger.info({ attempt: i + 1, waitMs }, "⏳ Waiting before retry...");
          await this.delay(waitMs);
        }

        const generated = await this.generateIntents(
          preferences,
          language,
          cityCost,
          localInsight,
        );

        if (intentParserService.isValidIntentFormat(generated.intents)) {
          logger.info(
            { destination: preferences.destination, attempt: i + 1 },
            "Successfully generated valid intents",
          );
          return { ...generated, attempts: i + 1 };
        }

        logger.warn({ attempt: i + 1 }, "Invalid intent format, retrying...");
      } catch (error: any) {
        const isRateLimit =
          error.message?.includes("429") ||
          error.message?.includes("Too Many Requests");

        logger.error(
          { attempt: i + 1, error: error.message, isRateLimit },
          "❌ AI generation attempt failed",
        );

        if (i === maxRetries - 1) {
          throw new Error(
            `AI failed to generate valid intents after ${maxRetries} attempts`,
          );
        }

        // Extra wait for rate limit errors
        if (isRateLimit) {
          const rateLimitWait = 3000;
          logger.info({ rateLimitWait }, "⏳ Rate limited, waiting extra...");
          await this.delay(rateLimitWait);
        }
      }
    }

    throw new Error("AI generation failed");
  }
}

export const aiAgentService = new AIAgentService();
