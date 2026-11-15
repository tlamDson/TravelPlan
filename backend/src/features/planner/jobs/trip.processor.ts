import { Job } from "bullmq";
import { workerLogger as logger } from "../../../lib/logger";
import { tripRepository } from "../repositories/trip.repository";
import { aiAgentService } from "../services/ai-agent.service";
import { intentParserService } from "../services/intent-parser.service";
import { validationService } from "../services/validation.service";
import { geoValidatorService } from "../services/geo-validator.service";
import { processChunkedTrip } from "../services/itinerary-chunker.service";
import type { TripIntents } from "../services/intent-parser.service";
import type { TripJobData } from "../trip.queue";
import { CityCost } from "../models/CityCost";
import { getStaticTemplate } from "../services/static-template.service";
import { isMVPDestination } from "../utils/destination-utils";
import {
  buildItinerary,
  getProgressPercent,
  updateJobProgress,
} from "./itinerary-builder";
import { fetchLocalInsightWithMeta } from "../services/local-insight.service";
import { GEMINI_MODEL } from "../../../config/gemini-models";
import {
  countUnresolvedPlaces,
  buildGenerationMeta,
} from "./itinerary-metrics";

const MIN_DUPLICATE_DISTANCE_KM = 0.1; // ~100m: treat ultra-close POIs as duplicates

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasValidCoords(coords?: [number, number]): coords is [number, number] {
  return !!coords && (coords[0] !== 0 || coords[1] !== 0);
}

export function dedupeValidatedPlaces(validated: any[]) {
  const kept: any[] = [];
  const seenNames = new Set<string>();
  const seenGoogleIds = new Set<string>();
  const dropped: Array<{ reason: string; name: string }> = [];

  for (const place of validated) {
    const nameKey = normalizeName(place.name ?? "");
    const googleId = place.googlePlaceId as string | undefined;

    if (googleId && seenGoogleIds.has(googleId)) {
      dropped.push({ reason: "googlePlaceId", name: place.name });
      continue;
    }

    if (nameKey && seenNames.has(nameKey)) {
      dropped.push({ reason: "name", name: place.name });
      continue;
    }

    if (hasValidCoords(place.coordinates)) {
      const tooClose = kept.some((k) => {
        if (!hasValidCoords(k.coordinates)) return false;
        const km = geoValidatorService.haversineKm(
          place.coordinates,
          k.coordinates,
        );
        return km <= MIN_DUPLICATE_DISTANCE_KM;
      });
      if (tooClose) {
        dropped.push({ reason: "distance", name: place.name });
        continue;
      }
    }

    kept.push(place);
    if (nameKey) seenNames.add(nameKey);
    if (googleId) seenGoogleIds.add(googleId);
  }

  return { kept, dropped };
}

/**
 * TRIP GENERATION WORKER PROCESSOR
 * Fire-and-listen architecture: processes BullMQ jobs async.
 * Progress: 20% → 50% → 80% → 90% → 100%
 */
export const tripGeneratorProcessor = async (job: Job<TripJobData>) => {
  const { tripId, userId, preferences, language, userTier } = job.data;

  // Route Pro trips > 5 days to the chunker (eager pre-fetch strategy)
  const startDate = new Date(preferences.startDate);
  const endDate = new Date(preferences.endDate);
  const tripDays =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

  if (userTier === "pro" && tripDays > 5) {
    logger.info(
      { tripId, userId, tripDays, userTier },
      "🧩 [CHUNK] Pro trip > 5 days — routing to chunker",
    );
    try {
      await processChunkedTrip(job, tripId, preferences, language);
      await tripRepository.releaseLock(tripId, job.id as string);
      await updateJobProgress(job, 100, "Completed");
      return { success: true, tripId, status: "COMPLETED" };
    } catch (error: any) {
      logger.error(
        { jobId: job.id, tripId, error: error.message },
        "❌ Chunked trip generation failed",
      );
      await tripRepository.releaseLock(tripId, job.id as string);
      await tripRepository.updateStatus(tripId, "FAILED");
      throw error;
    }
  }

  logger.info(
    { jobId: job.id, tripId, userId, preferences },
    "🚀 Starting trip generation",
  );

  logger.info(
    {
      destination: preferences.destination,
      startDate: preferences.startDate,
      endDate: preferences.endDate,
      budget: preferences.budget,
      travelers: preferences.travelers,
      mood: preferences.mood,
      interests: preferences.interests,
    },
    "📩 Preferences received by worker",
  );

  try {
    // 1. Verify trip exists and is locked to this job
    const trip = await tripRepository.findById(tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    if (String(trip.agentJobId) !== String(job.id)) {
      logger.warn(
        { tripAgentJobId: trip.agentJobId, jobId: job.id },
        "⚠️ Lock mismatch — force-reacquiring lock",
      );
      const reacquired = await tripRepository.forceAcquireLock(
        tripId,
        job.id as string,
      );
      if (!reacquired) {
        throw new Error(`Trip ${tripId} not found during lock reacquisition`);
      }
    }

    // 2. Generate AI intents — Step 1 (20%)
    await tripRepository.updateStatus(tripId, "PROCESSING_STEP_1");
    await updateJobProgress(job, 20, "Generating intents with Gemini...");
    logger.info({ jobId: job.id, tripId }, "Step 1: Generating intents...");

    const destName =
      preferences.destination.split(",")[0] || preferences.destination;
    const cityCost = isMVPDestination(destName)
      ? await CityCost.findOne({
          cityName: { $regex: new RegExp(destName, "i") },
        }).lean()
      : null;

    if (cityCost) {
      logger.info(
        {
          cityId: cityCost.cityId,
          minFoodUSD: cityCost.minFoodUSD,
          minHotelUSD: cityCost.minHotelUSD,
        },
        "💰 Found Base Costs for destination",
      );
    }

    // ─── Accommodation multiplier (Trade-off #3 mitigation) ──────────────
    // Scale the raw minHotelUSD from the DB to match the user's accommodation
    // preference. Airbnb has no free API → calculated as 0.75× hotel price.
    const ACCOMMODATION_MULTIPLIER: Record<string, number> = {
      hostel: 0.45, // dorm bed / budget guesthouse
      airbnb: 0.75, // private apartment (estimated)
      hotel: 1.0, // standard budget hotel (DB baseline)
      resort: 2.5, // full-service resort
      any: 0.7, // default: assume budget-conscious traveler
    };
    const accommodationType = preferences.accommodationType ?? "any";
    const multiplier = ACCOMMODATION_MULTIPLIER[accommodationType] ?? 0.7;

    // Build enriched cost context for the AI prompt
    const cityCostContext = cityCost
      ? {
          ...cityCost,
          // Override minHotelUSD with the type-adjusted floor price
          minHotelUSD: Math.round((cityCost.minHotelUSD ?? 50) * multiplier),
          accommodationType,
        }
      : undefined;

    // ─── RAG: Fetch local insight (Vector Search → Graceful Fallback to legacy insightText)
    // Shared with itinerary-chunker.service.ts — captures structured
    // metadata (not just a formatted string) so it can be persisted on
    // Trip.generationMeta, not just logged.
    const {
      localInsight,
      ragUsed,
      ragResultCount,
      ragAvgScore,
      ragFallbackReason,
    } = await fetchLocalInsightWithMeta(preferences, { jobId: job.id, tripId });

    const {
      intents,
      attempts: aiAttempts,
      promptTokens,
      totalTokens,
      latencyMs,
    } = await aiAgentService.generateIntentsWithRetry(
      preferences,
      language,
      cityCostContext,
      4,
      localInsight,
    );
    const intentList = intentParserService.flattenIntents(intents);
    logger.info(
      { jobId: job.id, tripId, intentCount: intentList.length },
      "Generated intents",
    );

    // 3. Parallel validation — Step 2 (50%)
    await tripRepository.updateStatus(tripId, "PROCESSING_STEP_2");
    await updateJobProgress(job, 50, "Validating intents...");
    logger.info({ jobId: job.id, tripId }, "Step 2: Validating intents...");

    let validated = await validationService.validateBatch(
      intentList,
      preferences.destination,
    );

    if (validated.length === 0) {
      logger.warn(
        { jobId: job.id, tripId, intentCount: intentList.length },
        "⚠️ [DEV MODE] No validated places — using raw AI intents as passthrough",
      );
      validated = intentList.map((intent) => ({
        name: intent,
        coordinates: [0, 0] as [number, number],
        confidence: 0,
        source: "cache" as const,
      }));
    }

    logger.info(
      {
        jobId: job.id,
        tripId,
        validated: validated.length,
        total: intentList.length,
      },
      "Validation complete",
    );

    // 3b. Supplementary fill — if some intents failed validation, request more
    // queries from AI to avoid leaving day slots empty.
    const deficit = intentList.length - validated.length;
    if (deficit > 0 && validated.length > 0) {
      logger.warn(
        {
          jobId: job.id,
          tripId,
          deficit,
          validated: validated.length,
          total: intentList.length,
        },
        "⚠️ [DEFICIT] Validation yield below intent count — requesting supplementary places",
      );

      const existingNames = validated.map((p) => p.name);
      const supplementaryQueries =
        await aiAgentService.generateSupplementaryQueries(
          deficit,
          preferences.destination,
          existingNames,
        );

      if (supplementaryQueries.length > 0) {
        const supplementaryValidated = await validationService.validateBatch(
          supplementaryQueries,
          preferences.destination,
        );
        validated = [...validated, ...supplementaryValidated];
        logger.info(
          {
            jobId: job.id,
            tripId,
            added: supplementaryValidated.length,
            newTotal: validated.length,
          },
          "✅ [DEFICIT] Supplementary places added",
        );
      }
    }

    // 3c. Deduplicate by name / googlePlaceId / ultra-close distance
    const dedupeResult = dedupeValidatedPlaces(validated);
    if (dedupeResult.dropped.length > 0) {
      logger.warn(
        {
          jobId: job.id,
          tripId,
          dropped: dedupeResult.dropped,
          before: validated.length,
          after: dedupeResult.kept.length,
        },
        "⚠️ [DEDUP] Removed duplicate or too-close places before itinerary build",
      );
    }
    validated = dedupeResult.kept;

    // 3d. If dedupe created a new deficit, request one more supplementary pass
    const postDedupeDeficit = intentList.length - validated.length;
    if (postDedupeDeficit > 0 && validated.length > 0) {
      logger.warn(
        {
          jobId: job.id,
          tripId,
          deficit: postDedupeDeficit,
          validated: validated.length,
          total: intentList.length,
        },
        "⚠️ [DEDUP DEFICIT] Dedup removed places — requesting supplementary fill",
      );

      const existingNames = validated.map((p) => p.name);
      const supplementaryQueries =
        await aiAgentService.generateSupplementaryQueries(
          postDedupeDeficit,
          preferences.destination,
          existingNames,
        );

      if (supplementaryQueries.length > 0) {
        const supplementaryValidated = await validationService.validateBatch(
          supplementaryQueries,
          preferences.destination,
        );
        validated = [...validated, ...supplementaryValidated];
        // Final dedupe pass (no more fill after this)
        const finalDedupe = dedupeValidatedPlaces(validated);
        validated = finalDedupe.kept;
      }
    }

    // 4. Build itinerary (80%)
    await updateJobProgress(job, 80, "Building itinerary...");
    logger.info({ jobId: job.id, tripId }, "Step 3: Building itinerary...");

    const itinerary = await buildItinerary(
      intents as TripIntents,
      validated,
      preferences,
    );
    logger.info(
      { tripId, totalDays: itinerary.length },
      "✅ [ITINERARY] Final structure before saving",
    );

    // 5. Save & complete (90% → 100%)
    const generationMeta = buildGenerationMeta({
      ragUsed,
      ragResultCount,
      ragAvgScore,
      ragFallbackReason,
      model: GEMINI_MODEL,
      aiAttempts,
      unresolvedPlaceCount: countUnresolvedPlaces(itinerary),
      promptTokens,
      totalTokens,
      latencyMs,
    });
    await tripRepository.update(tripId, { itinerary, generationMeta });
    await tripRepository.updateStatus(tripId, "COMPLETED");
    await updateJobProgress(job, 90, "Finalizing...");
    logger.info({ jobId: job.id, tripId }, "Step 4: Finalizing...");

    await tripRepository.releaseLock(tripId, job.id as string);
    await updateJobProgress(job, 100, "Completed");

    // No `duration` field here — job.finishedOn is unset while the
    // processor is still running, so it always computed 0. Real job
    // latency is now measured in attach-job-metrics.ts's `completed`
    // handler, where finishedOn is actually populated.
    logger.info({ jobId: job.id, tripId }, "✅ Trip generation completed");

    return { success: true, tripId, status: "COMPLETED" };
  } catch (error: any) {
    logger.error(
      { jobId: job.id, tripId, error: error.message, stack: error.stack },
      "❌ Trip generation failed",
    );

    if (userTier === "free" && isMVPDestination(preferences.destination)) {
      const template = getStaticTemplate(preferences.destination);
      if (template) {
        logger.info(
          { jobId: job.id, tripId },
          "🛡️ Applying static fallback template for Free user",
        );
        try {
          await tripRepository.update(tripId, {
            itinerary: template,
          });
          await tripRepository.updateStatus(tripId, "FALLBACK");
          await tripRepository.releaseLock(tripId, job.id as string);
          await updateJobProgress(job, 100, "Completed with fallback");
          // DO NOT THROW error here. Return success to BullMQ so job is complete.
          return { success: true, tripId, status: "FALLBACK" };
        } catch (fallbackError: any) {
          logger.error(
            { jobId: job.id, tripId, error: fallbackError.message },
            "❌ Failed to apply fallback template",
          );
        }
      }
    }

    try {
      await updateJobProgress(
        job,
        getProgressPercent(job.progress),
        `Failed: ${error.message}`,
      ).catch(() => undefined);
      await tripRepository.releaseLock(tripId, job.id as string);
      await tripRepository.updateStatus(tripId, "FAILED");
    } catch (releaseError: any) {
      logger.error(
        { jobId: job.id, tripId, error: releaseError.message },
        "Failed to release lock after error",
      );
    }

    throw error;
  }
};
