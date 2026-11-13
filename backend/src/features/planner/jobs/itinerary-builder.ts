import { Job } from "bullmq";
import sanitizeHtml from "sanitize-html";
import {
  type TripIntents,
  SLOT_ORDER as INTENT_SLOT_ORDER,
  sortedDayKeys,
} from "../services/intent-parser.service";
import type { ValidatedPlace } from "../services/validation.service";
import type { TripPreferences } from "@travelplan/shared";
import type { IActivity } from "../models/Trip.types";
import { geoValidatorService } from "../services/geo-validator.service";
import { resolveDayHours } from "../services/opening-hours";
import { nearbyFoodService } from "../services/nearby-food.service";
import { logger } from "../../../lib/logger";
import type { TransportMode } from "../services/geo-validator.service";
import type { TripJobData } from "../trip.queue";

// ─── Slot-aware geographic clustering ────────────────────────────────────────
// Strategy: cluster places by proximity (so nearby places share a day) AND
// sort within each cluster by original slot order (morning→…→night)
// so that intent semantics are preserved even after geographic re-grouping.

const SLOT_ORDER_MAP: Record<string, number> = Object.fromEntries(
  INTENT_SLOT_ORDER.map((s, i) => [s, i]),
);

export interface TaggedPlace {
  place: ValidatedPlace;
  slotType: string;
  slotOrder: number;
}

// Reconstruct the (slot, ValidatedPlace) correspondence by iterating intents
// in the same order as flattenIntents so that validated[i] maps to the correct
// (day, slot) pair. Supports 2–6 slots per day.
export function buildTaggedPlaces(
  intents: TripIntents,
  validated: ValidatedPlace[],
): TaggedPlace[] {
  const tagged: TaggedPlace[] = [];
  let idx = 0;

  for (const dayKey of sortedDayKeys(intents)) {
    const slots = intents[dayKey];
    if (!slots || typeof slots !== "object") continue;

    for (const slotType of INTENT_SLOT_ORDER) {
      const q = slots[slotType];
      if (!q || typeof q !== "string" || !q.trim()) continue;
      if (idx < validated.length) {
        tagged.push({
          place: validated[idx]!,
          slotType,
          slotOrder: SLOT_ORDER_MAP[slotType] ?? 0,
        });
      }
      idx++;
    }
  }

  return tagged;
}

// Greedy nearest-neighbor clustering on TaggedPlace[].
// After each cluster is assembled, it is sorted by slotOrder so that
// "morning-type" places always precede "afternoon-type" which precede "evening-type".
// Result: geographic grouping + preserved temporal intent within each day.
export function clusterByProximity(
  taggedPlaces: TaggedPlace[],
  numDays: number,
  slotsPerDay: number,
): TaggedPlace[][] {
  if (taggedPlaces.length === 0 || numDays === 0) {
    return Array.from({ length: numDays }, () => []);
  }

  // Separate valid-coord entries from [0,0] passthrough fallbacks
  const withCoords = taggedPlaces.filter(
    (t) => t.place.coordinates[0] !== 0 || t.place.coordinates[1] !== 0,
  );
  const withoutCoords = taggedPlaces.filter(
    (t) => t.place.coordinates[0] === 0 && t.place.coordinates[1] === 0,
  );

  if (withCoords.length === 0) {
    return Array.from({ length: numDays }, (_, i) =>
      taggedPlaces.slice(i * slotsPerDay, (i + 1) * slotsPerDay),
    );
  }

  const clusters: TaggedPlace[][] = Array.from({ length: numDays }, () => []);
  const used = new Set<number>();

  for (let day = 0; day < numDays; day++) {
    const remaining = numDays - day;
    const targetSize = Math.min(
      slotsPerDay,
      Math.ceil((withCoords.length - used.size) / remaining),
    );

    const seedIdx = withCoords.findIndex((_, i) => !used.has(i));
    if (seedIdx === -1) break;

    used.add(seedIdx);
    clusters[day]!.push(withCoords[seedIdx]!);

    while (clusters[day]!.length < targetSize) {
      const anchor = clusters[day]![clusters[day]!.length - 1]!;
      let nearestIdx = -1;
      let nearestDist = Infinity;

      for (let i = 0; i < withCoords.length; i++) {
        if (used.has(i)) continue;
        const dist = geoValidatorService.haversineKm(
          anchor.place.coordinates,
          withCoords[i]!.place.coordinates,
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      if (nearestIdx === -1) break;
      used.add(nearestIdx);
      clusters[day]!.push(withCoords[nearestIdx]!);
    }

    // Re-sort within the cluster by original slot intent:
    // morning-type activities first, then afternoon, then evening.
    clusters[day]!.sort((a, b) => a.slotOrder - b.slotOrder);
  }

  // Fill short clusters with passthrough places ([0,0] coords — dev fallback)
  let passthroughIdx = 0;
  for (const cluster of clusters) {
    while (
      cluster.length < slotsPerDay &&
      passthroughIdx < withoutCoords.length
    ) {
      cluster.push(withoutCoords[passthroughIdx++]!);
    }
  }

  return clusters;
}

export function getProgressPercent(progress: unknown): number {
  if (typeof progress === "number") return progress;
  if (progress && typeof progress === "object") {
    const percent = (progress as { percent?: number }).percent;
    return typeof percent === "number" ? percent : 0;
  }
  return 0;
}

export async function updateJobProgress(
  job: Job<TripJobData>,
  percent: number,
  currentStep: string,
) {
  await job.updateProgress({ percent, currentStep });
}

// Default start times mapped to slot names
const SLOT_START_TIMES: Record<string, string> = {
  breakfast: "08:00",
  morning: "09:30",
  "late morning": "11:30",
  lunch: "12:30",
  afternoon: "14:30",
  "late afternoon": "16:30",
  dinner: "18:30",
  evening: "20:00",
  night: "21:30",
};

export async function buildItinerary(
  intents: TripIntents,
  validated: ValidatedPlace[],
  preferences: TripPreferences,
): Promise<any[]> {
  const itinerary: any[] = [];

  const startDateStr = new Date(preferences.startDate)
    .toISOString()
    .slice(0, 10);
  const endDateStr = new Date(preferences.endDate).toISOString().slice(0, 10);
  const msPerDay = 1000 * 60 * 60 * 24;
  const expectedDays =
    Math.round(
      (new Date(endDateStr).getTime() - new Date(startDateStr).getTime()) /
        msPerDay,
    ) + 1;

  const activitiesPerDay = preferences.activitiesPerDay ?? 3;
  const transportMode: TransportMode =
    (preferences.transportMode as TransportMode) ?? "walking";

  // Tag each validated place with its original slot intent (morning/afternoon/evening),
  // then cluster by geographic proximity while sorting within each cluster by slot order.
  // This guarantees: nearby places share a day AND morning-type activities stay in the morning.
  const tagged = buildTaggedPlaces(intents, validated);
  const clusters = clusterByProximity(tagged, expectedDays, activitiesPerDay);

  logger.info(
    {
      totalValidated: validated.length,
      totalTagged: tagged.length,
      numDays: expectedDays,
      clusterSizes: clusters.map((c, i) => ({
        day: i + 1,
        places: c.length,
        slots: c.map((t) => t.slotType),
      })),
    },
    "📍 [GEO-CLUSTER] Places grouped by proximity (slot order preserved)",
  );

  for (let dayNum = 0; dayNum < expectedDays; dayNum++) {
    const dayDate = new Date(
      new Date(startDateStr).getTime() + dayNum * msPerDay,
    );

    const activities: IActivity[] = [];
    let order = 0;

    // Each day consumes its own geographic cluster — no global counter, no wrap repeats.
    // Places are already sorted morning→afternoon→evening within the cluster.
    const dayTagged = clusters[dayNum] ?? [];

    for (const taggedPlace of dayTagged) {
      const place = taggedPlace.place;
      const slot = taggedPlace.slotType;

      if (place) {
        const activity: IActivity = {
          type: "poi",
          name: sanitizeHtml(place.name, {
            allowedTags: [],
            allowedAttributes: {},
          }),
          location: {
            type: "Point",
            coordinates: place.coordinates,
          },
          time: SLOT_START_TIMES[slot] ?? "09:00",
          status: "planned",
          order,
        };

        // If it's a meal explicitly inject it into notes to trigger the frontend highlighting
        if (["breakfast", "lunch", "dinner"].includes(slot)) {
          activity.notes = slot.charAt(0).toUpperCase() + slot.slice(1);
        }

        if (place.googlePlaceId) {
          activity.location!.googlePlaceId = place.googlePlaceId;
        }
        if (place.rating !== undefined) activity.rating = place.rating;
        if (place.priceLevel !== undefined)
          activity.priceLevel = place.priceLevel;
        if (place.photoUrl) activity.photoUrl = place.photoUrl;

        // Dates are UTC midnight; local getDay() would shift the weekday on a non-UTC host.
        const dayJs = dayDate.getUTCDay();
        const detail = resolveDayHours(place.openingPeriods, dayJs);
        if (detail) activity.openingHoursDetail = detail;

        if (place.openingHoursArray && place.openingHoursArray.length > 0) {
          const googleIdx = dayJs === 0 ? 6 : dayJs - 1;
          const entry = place.openingHoursArray[googleIdx];
          if (entry) {
            const colonIdx = entry.indexOf(":");
            activity.openingHours =
              colonIdx !== -1 ? entry.slice(colonIdx + 1).trim() : entry;
          }
        } else if (place.openingHours) {
          activity.openingHours = place.openingHours;
        }

        // ─── Nearby food suggestions ─────────────────────────────────────
        // Fire-and-forget with cache: costs 0 API calls on cache hit
        try {
          const anchorArg: {
            coordinates: [number, number];
            name: string;
            googlePlaceId?: string;
          } = {
            coordinates: place.coordinates,
            name: place.name,
          };
          if (place.googlePlaceId)
            anchorArg.googlePlaceId = place.googlePlaceId;

          const food = await nearbyFoodService.getNearbyFood(
            anchorArg,
            transportMode,
          );
          if (food.length > 0) {
            (activity as any).nearbySuggestions = food;
          }
        } catch {
          // Non-blocking: nearby food suggestions are best-effort
        }

        activities.push(activity);
        order++;
      }
    }

    // ─── Distance validation between consecutive activities ───────────────
    // Flags activities that are too far apart for the chosen transport mode
    for (let i = 1; i < activities.length; i++) {
      const prev = activities[i - 1];
      const curr = activities[i];
      if (!prev || !curr) continue;
      const prevCoords = prev.location?.coordinates;
      const currCoords = curr.location?.coordinates;
      if (
        prevCoords?.length === 2 &&
        currCoords?.length === 2 &&
        (prevCoords[0] !== 0 || prevCoords[1] !== 0) &&
        (currCoords[0] !== 0 || currCoords[1] !== 0)
      ) {
        const { km, requiresTransport } = geoValidatorService.validateDistance(
          prevCoords as [number, number],
          currCoords as [number, number],
          transportMode,
        );
        (curr as any).requiresTransport = requiresTransport;
        (curr as any).distanceFromPrevious = km;

        // Log distance for debugging thresholds
        logger.info(
          {
            day: dayNum + 1,
            from: prev.name,
            to: curr.name,
            distanceKm: km,
            mode: transportMode,
            exceedsThreshold: requiresTransport,
          },
          `🚶‍♂️ [DISTANCE] ${prev.name} ➔ ${curr.name}: ${km}km`,
        );
      }
    }

    itinerary.push({ day: dayNum + 1, date: dayDate, activities });
  }

  return itinerary;
}
