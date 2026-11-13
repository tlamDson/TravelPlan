import { Document, Types } from "mongoose";
import type { DayHours } from "../services/opening-hours";
import type {
  TripStatus as SharedTripStatus,
  TripLifecycle as SharedTripLifecycle,
} from "@travelplan/shared";

export type TripStatus = SharedTripStatus;
export type TripLifecycle = SharedTripLifecycle;

/** Budget category breakdown (e.g., food, accommodation, transport) */
export interface IBudgetCategory {
  name: string;
  limit: number;
  spent: number;
}

/** Embedded budget - eliminates separate Budget collection lookup */
export interface IEmbeddedBudget {
  currency: string;
  totalLimit: number;
  totalSpent: number;
  breakdown: IBudgetCategory[];
}

/** Activity within a day's itinerary */
export interface IActivity {
  /** Present on every persisted activity (ActivitySchema uses `{ _id: true }`)
   * — optional here because freshly-built replacement objects (e.g.
   * activity-regen.service.ts's regenOne()) don't have one until Mongoose
   * assigns it on save. */
  _id?: Types.ObjectId;
  type: "poi" | "accommodation" | "transport" | "custom";
  /** Reference to Place collection for static data */
  placeId?: Types.ObjectId;
  /** Snapshot of critical info - avoids fetching Place just to render list */
  name: string;
  location?: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
    googlePlaceId?: string;
  };
  /** Dynamic trip-specific details */
  time?: string;
  endTime?: string;
  cost?: number;
  status: "planned" | "confirmed" | "completed" | "cancelled";
  notes?: string;
  order: number;
  /** Rich place data from Mapbox + Google Places */
  rating?: number;
  priceLevel?: number;
  photoUrl?: string;
  openingHours?: string;
  /** Language-neutral hours for this activity's weekday; the client renders the labels */
  openingHoursDetail?: DayHours;
  /** Distance validation — set by geo-validator when activity requires non-walking transport */
  requiresTransport?: boolean;
  /** Distance from the previous activity in the day (in km) */
  distanceFromPrevious?: number;
  /** Nearby food/snack suggestions around this activity anchor (cached from Google Places) */
  nearbySuggestions?: Array<{
    name: string;
    placeId: string;
    distanceKm: number;
    priceLevel?: number;
    photoUrl?: string;
  }>;
}

/** `IActivity` as it actually exists on a hydrated Mongoose subdocument —
 * `_id` and `toObject()` are guaranteed by ActivitySchema's `{ _id: true }`
 * at runtime but not modeled by the plain IActivity interface above (which
 * also describes freshly-built, not-yet-persisted replacement objects). Cast
 * to this instead of `any` at the few call sites that need `.toObject()` or
 * a guaranteed `_id` (e.g. building an id → activity Map for reordering). */
export interface IActivitySubdocument extends IActivity {
  _id: Types.ObjectId;
  toObject(): IActivity;
}

/** Single day in the itinerary */
export interface IItineraryDay {
  day: number;
  date: Date;
  /** GeoHash for map focus optimization */
  geoHash?: string;
  activities: IActivity[];
}

/** Generation provenance — makes "did RAG fire" / "did the AI fall back
 * silently" queryable Trip fields instead of only ever a [RAG_USED] log
 * line. See trip.processor.ts and plans/1-rag-eval-eventual-hickey.md. */
export interface IGenerationMeta {
  /** true only when Atlas $vectorSearch returned >=1 result. */
  ragUsed: boolean;
  ragResultCount: number;
  /** Avg vectorSearchScore, or null when !ragUsed. */
  ragAvgScore?: number | null;
  /** null when ragUsed; else a coarse machine string — see
   * place-insight-retrieval.service.ts's fallback paths (deliberately
   * doesn't distinguish "no city resolved" vs "zero hits" vs "errored";
   * retrievePlaceInsights() collapses all three to [] by design). */
  ragFallbackReason?: string | null;
  /** Gemini model string used — see config/gemini-models.ts. */
  model: string;
  /** generateContent attempts generateIntentsWithRetry() took. */
  aiAttempts: number;
  /** Activities left at [0,0] by the passthrough guard. */
  unresolvedPlaceCount: number;
  promptTokens?: number | null;
  totalTokens?: number | null;
  /** Wall-clock ms for the generateContent call. */
  latencyMs?: number | null;
}

/** City stop within the trip */
export interface ICityStop {
  cityId: Types.ObjectId;
  order: number;
  stayNights: number;
  /** Embedded stay details instead of Accommodation references */
  stays: {
    placeId?: Types.ObjectId;
    name: string;
    type: "hotel" | "hostel" | "airbnb" | "other";
    checkIn: Date;
    checkOut: Date;
    pricePerNight: number;
    totalPrice: number;
    confirmationNumber?: string;
    status: "pending" | "confirmed" | "cancelled";
  }[];
}

// ============================================
// MAIN TRIP INTERFACE (Super-Document Pattern)
// ============================================
export interface ITrip extends Document {
  userId: string;
  title: string;
  destination?: string;
  description?: string;
  startDate: Date;
  endDate: Date;

  // Preferences (Wizard inputs)
  purpose?: "leisure" | "business" | "bleisure" | "family_visit" | "event";
  groupType?: "solo" | "couple" | "family_kids" | "friends" | "work";
  priorities?: {
    money: number;
    comfort: number;
    unique: number;
  };
  mood?:
    "city_break" | "beach" | "hiking" | "foodie" | "romantic" | "adventure";
  dealBreakers?: string[];

  // 1. EMBEDDED BUDGET (No separate collection)
  budget: IEmbeddedBudget;

  // 2. EMBEDDED ITINERARY (No separate collection)
  itinerary: IItineraryDay[];

  // 3. City stops with embedded stays
  cities: ICityStop[];

  // 4. AGENT LOCKING (Distributed Systems)
  /** Prevents User from editing while Agent is working */
  isAgentProcessing: boolean;
  agentJobId?: string;
  agentLockedAt?: Date;

  // 4b. CHUNKED GENERATION (Pro trips > 5 days)
  totalChunks?: number;
  chunksReady?: boolean[];
  regenCount?: number;

  // 4c. GENERATION PROVENANCE — see IGenerationMeta above
  generationMeta?: IGenerationMeta;

  // 5. OPTIMISTIC CONCURRENCY CONTROL
  version: number;

  // 6. UNDO HISTORY — snapshots of itinerary for undo/redo support (max 5 kept)
  itineraryHistory?: Array<{
    snapshot: IItineraryDay[];
    savedAt: Date;
  }>;

  // Metadata
  status: TripStatus;
  lifecycle: TripLifecycle;
  coverImage?: string;
  tags?: string[];

  /** Google Calendar event IDs — key = activity._id (Entity ID), value = Google eventId */
  googleEventIds?: Record<string, string>;

  createdAt: Date;
  updatedAt: Date;
}
