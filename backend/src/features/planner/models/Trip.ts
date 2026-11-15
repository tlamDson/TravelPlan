import mongoose, { Schema } from "mongoose";
import { ITrip } from "./Trip.types";
import { TripStatusValues, TripLifecycleValues } from "@travelplan/shared";
import { attachTripMethods } from "./Trip.methods";
import {
  EmbeddedBudgetSchema,
  ItineraryDaySchema,
  CityStopSchema,
  GenerationMetaSchema,
} from "./Trip.schemas";

export type { ITrip } from "./Trip.types";

const TripSchema = new Schema<ITrip>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    destination: { type: String },
    description: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    purpose: {
      type: String,
      enum: ["leisure", "business", "bleisure", "family_visit", "event"],
    },
    groupType: {
      type: String,
      enum: ["solo", "couple", "family_kids", "friends", "work"],
    },
    priorities: {
      money: { type: Number, min: 1, max: 10 },
      comfort: { type: Number, min: 1, max: 10 },
      unique: { type: Number, min: 1, max: 10 },
    },
    mood: {
      type: String,
      enum: [
        "city_break",
        "beach",
        "hiking",
        "foodie",
        "romantic",
        "adventure",
      ],
    },
    dealBreakers: [String],

    budget: {
      type: EmbeddedBudgetSchema,
      required: true,
      default: () => ({
        currency: "USD",
        totalLimit: 0,
        totalSpent: 0,
        breakdown: [],
      }),
    },

    itinerary: {
      type: [ItineraryDaySchema],
      default: [],
    },

    cities: [CityStopSchema],

    isAgentProcessing: { type: Boolean, default: false, index: true },
    agentJobId: String,
    agentLockedAt: Date,

    // Chunked generation tracking (Pro trips > 5 days)
    totalChunks: { type: Number, default: 0 },
    chunksReady: { type: [Boolean], default: [] },
    regenCount: { type: Number, default: 0, min: 0 },

    // Generation provenance — absent until the first generation writes it
    // (see IGenerationMeta / GenerationMetaSchema), not defaulted to a
    // wall of zeros.
    generationMeta: { type: GenerationMetaSchema, default: undefined },

    version: { type: Number, default: 1 },

    // Undo history: stores up to 5 itinerary snapshots for undo/redo
    itineraryHistory: {
      type: [
        {
          snapshot: Schema.Types.Mixed,
          savedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false, // excluded from default queries (large field)
    },

    status: {
      type: String,
      enum: TripStatusValues as unknown as string[],
      default: "DRAFT",
      index: true,
    },
    lifecycle: {
      type: String,
      enum: TripLifecycleValues as unknown as string[],
      default: "UPCOMING",
      index: true,
    },
    coverImage: String,
    tags: [String],

    /** Google Calendar event IDs — key = activity._id, value = Google eventId */
    googleEventIds: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    // Enable optimistic concurrency via version key
    optimisticConcurrency: true,
  },
);
TripSchema.index({ userId: 1, startDate: -1 });

TripSchema.index({ userId: 1, status: 1 });

TripSchema.index({ agentJobId: 1 }, { sparse: true });
TripSchema.pre("save", function () {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
});
attachTripMethods(TripSchema);

export default mongoose.model<ITrip>("Trip", TripSchema);
