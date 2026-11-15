---
name: itinerary-builder
description: Use when changing TravelPlan's itinerary generation pipeline — backend/src/features/planner/jobs/itinerary-builder.ts, trip.processor.ts, ai-agent.service.ts, validation.service.ts, intent-parser.service.ts, geographic clustering, or any logic where the AI generates places that are then validated/clustered into a day-by-day itinerary.
---

# Itinerary Builder Protocol

TravelPlan's itinerary generation pipeline has 3 layers: **the AI generates search intents (text queries, not coordinates) → Mapbox/Google Places validate them into real places with coordinates → geographic clustering + time slots turn them into an itinerary**. This is an "intent-based" architecture — the AI never invents coordinates, it only generates search queries.

Source documents, full detail: `docs/implementation/ai-trip-generation.md` (1234 lines) and `docs/implementation/caching-optimization.md`. Operating targets: $0.02–0.04/trip, <20s generation, 60–80% cache hit thanks to `PlaceCache`.

## Mandatory order — do not change it, do not skip a step

```
flattenIntents()  →  validateBatch()  →  [deficit check + fill]  →  buildTaggedPlaces()  →  clusterByProximity()  →  buildItinerary()
```

The corresponding real files (checked against the code, not just the docs):

| Step                                          | File                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| Generate intents per slot (`SLOT_ORDER`)      | `backend/src/features/planner/services/intent-parser.service.ts`                  |
| Validate a batch through Mapbox/Google Places | `backend/src/features/planner/services/validation.service.ts`                     |
| Attach the `{place, slotType, slotOrder}` tag | `buildTaggedPlaces()` in `backend/src/features/planner/jobs/itinerary-builder.ts` |
| Geographic clustering                         | `clusterByProximity()` in the same file                                           |
| Orchestrate the whole job                     | `backend/src/features/planner/jobs/trip.processor.ts`                             |

## Hard rules

- **No global round-robin index** for assigning places to days (`globalIdx = (globalIdx + 1) % validated.length`) — it generates duplicate places across days. Use a per-day structure: `clusters[dayNum][dayIdx++]`.
- **`buildTaggedPlaces()` rebuilds the (slot, ValidatedPlace) correspondence by iterating the intents in exactly the `flattenIntents` order** — `validated[idx]` must match the original `(day, slot)`. Do not change the iteration order without updating both sides together.
- **Deficit guard**: if `validated.length < intentList.length` (some intents found no real place), call `aiAgentService.generateSupplementaryQueries(deficit, destination, existingNames)` to make up the difference, then validate again and append — never silently skip a missing slot.
- **Clustering runs on `{place, slotType, slotOrder}` tuples**, not on a bare `ValidatedPlace[]` — after clustering by proximity, each cluster must be re-sorted by `slotOrder` (morning=0, ..., per `SLOT_ORDER` in `intent-parser.service.ts`) to keep the time semantics even though the places were regrouped geographically.
- **`geoValidatorService.validateDistance()` (`backend/src/features/planner/services/geo-validator.service.ts`) is for diagnostics/display only** — `requiresTransport`/`distanceFromPrevious` are metadata for the UI, and its result must **never** be used to trigger re-clustering or re-grouping.
- Coordinates `[0, 0]` are a passthrough fallback (a place whose real location could not be determined) — the code already separates `withCoords`/`withoutCoords` in `clusterByProximity`; do not merge them when computing distances.

## AI is an untrusted service

The AI (Gemini) must not call external APIs directly — it only generates text intents, and every place must go through `validateBatch()` to be checked against real Mapbox/Google Places before it counts as valid. A circuit breaker (`opossum`, `backend/src/features/planner/tools/circuit-breaker.ts`) wraps the Mapbox/Google Places geocoding/text-search calls. AI retries at most 3 times, then fails gracefully instead of crashing the job.

## When writing tests for this module

The domains that need the most careful testing (see also `.claude/agents/qa-testing.md`): no global index causing duplicate places; the deficit guard really calls the supplementary queries when places are missing; `buildTaggedPlaces` maps the right slot even when some slots are left empty (empty query); clusters sort correctly by `slotOrder` after geographic grouping. Use the golden fixtures in `backend/src/test/fixtures/` (`valid-trip.json`, `malformed-trip.json`, `empty-results.json`) instead of calling real Gemini/Mapbox.
