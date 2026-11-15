/**
 * Itinerary Chunker Service — Pro tier, trips > 5 days.
 *
 * Strategy: Eager pre-fetch.
 * 1. Generate + validate + build Chunk 1 (Day 1-3), save to DB immediately.
 * 2. Mark trip.chunksReady[0] = true so Frontend can render Day 1-3 right away.
 * 3. Without waiting, generate Chunk 2 in the same async call chain.
 * 4. Each subsequent chunk is saved and marked ready in turn.
 * 5. When all chunks are ready, trip.status → COMPLETED.
 *
 * Frontend polls trip.chunksReady[] and fetches chunks on demand.
 * Because chunks are pre-built before the user scrolls, latency on scroll ≈ 0.
 */

import { Job } from "bullmq";
import { logger } from "../../../lib/logger";
import { tripRepository } from "../repositories/trip.repository";
import { aiAgentService } from "./ai-agent.service";
import { intentParserService } from "./intent-parser.service";
import { validationService } from "./validation.service";
import { buildItinerary, updateJobProgress } from "../jobs/itinerary-builder";
import {
  countUnresolvedPlaces,
  buildGenerationMeta,
} from "../jobs/itinerary-metrics";
import type { TripPreferences } from "@travelplan/shared";
import type { TripIntents } from "./intent-parser.service";
import { CityCost } from "../models/CityCost";
import type { IItineraryDay } from "../models/Trip.types";
import { fetchLocalInsightWithMeta } from "./local-insight.service";
import { GEMINI_MODEL } from "../../../config/gemini-models";
import { slicePreferences, rebaseDays } from "./chunk-helpers";

const CHUNK_SIZE = 3; // days per chunk

/**
 * Process a long trip (Pro, > 5 days) by generating 3-day chunks sequentially
 * and saving each chunk to MongoDB as soon as it is ready.
 */
export async function processChunkedTrip(
  job: Job,
  tripId: string,
  preferences: TripPreferences,
  language?: string,
): Promise<void> {
  const startDate = new Date(preferences.startDate);
  const endDate = new Date(preferences.endDate);
  const totalDays =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;
  const totalChunks = Math.ceil(totalDays / CHUNK_SIZE);

  logger.info(
    { tripId, totalDays, totalChunks, chunkSize: CHUNK_SIZE },
    "🧩 [CHUNK] Starting chunked itinerary generation",
  );

  // Initialise tracking fields on the trip
  await tripRepository.update(tripId, {
    totalChunks,
    chunksReady: Array(totalChunks).fill(false),
  });

  const destination =
    preferences.destination.split(",")[0] || preferences.destination;
  const cityCost = await CityCost.findOne({
    cityName: { $regex: new RegExp(destination, "i") },
  }).lean();

  // Fetched ONCE for the whole trip, not per chunk — the destination
  // doesn't change between chunks, only the day range does, and
  // buildRetrievalQuery()'s query text is keyed on focus/pace, not dates.
  // Previously this file never called RAG retrieval at all: every Pro trip
  // >5 days generated with zero local grounding, less than free-tier trips
  // got.
  const {
    localInsight,
    ragUsed,
    ragResultCount,
    ragAvgScore,
    ragFallbackReason,
  } = await fetchLocalInsightWithMeta(preferences, { tripId });

  // Collect all generated day objects across chunks
  const allDays: IItineraryDay[] = [];
  let totalAiAttempts = 0;
  let promptTokenSum = 0;
  let totalTokenSum = 0;
  let latencyMsSum = 0;
  let anyUsageCaptured = false;

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const dayOffset = chunkIdx * CHUNK_SIZE;
    const remainingDays = totalDays - dayOffset;
    const chunkDays = Math.min(CHUNK_SIZE, remainingDays);

    const chunkPrefs = slicePreferences(preferences, dayOffset, chunkDays);
    const progressBase = 20 + Math.round((chunkIdx / totalChunks) * 70);

    logger.info(
      { tripId, chunkIdx, dayOffset, chunkDays },
      `🧩 [CHUNK ${chunkIdx + 1}/${totalChunks}] Generating…`,
    );

    await updateJobProgress(
      job,
      progressBase,
      `Generating days ${dayOffset + 1}–${dayOffset + chunkDays}…`,
    );

    // Generate AI intents for this chunk — localInsight is the same
    // trip-wide RAG context fetched once above, not re-fetched per chunk.
    const { intents, attempts, promptTokens, totalTokens, latencyMs } =
      await aiAgentService.generateIntentsWithRetry(
        chunkPrefs,
        language,
        cityCost ?? undefined,
        4,
        localInsight,
      );
    totalAiAttempts += attempts;
    latencyMsSum += latencyMs;
    if (promptTokens !== null || totalTokens !== null) {
      anyUsageCaptured = true;
      promptTokenSum += promptTokens ?? 0;
      totalTokenSum += totalTokens ?? 0;
    }

    const intentList = intentParserService.flattenIntents(intents);

    // Validate
    let validated = await validationService.validateBatch(
      intentList,
      preferences.destination,
    );

    // Passthrough guard — dev mode safety net
    if (validated.length === 0) {
      validated = intentList.map((intent) => ({
        name: intent,
        coordinates: [0, 0] as [number, number],
        confidence: 0,
        source: "cache" as const,
      }));
    }

    // Build itinerary for this chunk
    const chunkDayStructures = await buildItinerary(
      intents as TripIntents,
      validated,
      chunkPrefs,
    );

    // Rebase day numbers to absolute trip-level numbers
    const rebasedDays = rebaseDays(chunkDayStructures, dayOffset, startDate);
    allDays.push(...rebasedDays);

    // Save accumulated days to DB and mark this chunk as ready
    const chunksReady = Array(totalChunks).fill(false);
    for (let i = 0; i <= chunkIdx; i++) chunksReady[i] = true;

    await tripRepository.update(tripId, {
      itinerary: allDays,
      chunksReady,
      // Keep status as PROCESSING until the last chunk
      status: chunkIdx < totalChunks - 1 ? "PROCESSING_STEP_2" : "COMPLETED",
    });

    logger.info(
      { tripId, chunkIdx, daysReady: allDays.length, chunksReady },
      `✅ [CHUNK ${chunkIdx + 1}/${totalChunks}] Saved to DB`,
    );
  }

  // One generationMeta for the whole trip, not per chunk — aiAttempts/token
  // sums are totals across every chunk's AI call.
  const generationMeta = buildGenerationMeta({
    ragUsed,
    ragResultCount,
    ragAvgScore,
    ragFallbackReason,
    model: GEMINI_MODEL,
    aiAttempts: totalAiAttempts,
    unresolvedPlaceCount: countUnresolvedPlaces(allDays),
    promptTokens: anyUsageCaptured ? promptTokenSum : null,
    totalTokens: anyUsageCaptured ? totalTokenSum : null,
    latencyMs: latencyMsSum,
  });
  await tripRepository.update(tripId, { generationMeta });

  // Ensure final status
  await tripRepository.updateStatus(tripId, "COMPLETED");
}
