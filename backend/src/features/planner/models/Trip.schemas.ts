/**
 * Sub-document schemas embedded in Trip — split out of Trip.ts (which was
 * already over the repo's 200-line limit before adding generationMeta) so
 * neither file crosses it. No other file imports these by name; they only
 * compose TripSchema.
 */
import { Schema } from "mongoose";
import type {
  IBudgetCategory,
  IEmbeddedBudget,
  IActivity,
  IItineraryDay,
  ICityStop,
  IGenerationMeta,
} from "./Trip.types";

export const BudgetCategorySchema = new Schema<IBudgetCategory>(
  {
    name: { type: String, required: true },
    limit: { type: Number, required: true, min: 0 },
    spent: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

export const EmbeddedBudgetSchema = new Schema<IEmbeddedBudget>(
  {
    currency: { type: String, default: "USD" },
    totalLimit: { type: Number, required: true, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    breakdown: [BudgetCategorySchema],
  },
  { _id: false },
);

const dayHoursSchema = new Schema(
  {
    kind: { type: String, enum: ["open24h", "closed", "ranges"] },
    ranges: [new Schema({ open: String, close: String }, { _id: false })],
  },
  { _id: false },
);

export const ActivitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      enum: ["poi", "accommodation", "transport", "custom"],
      required: true,
    },
    placeId: { type: Schema.Types.ObjectId, ref: "Place" },
    name: { type: String, required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: [Number],
      googlePlaceId: String,
    },
    time: String,
    endTime: String,
    cost: Number,
    status: {
      type: String,
      enum: ["planned", "confirmed", "completed", "cancelled"],
      default: "planned",
    },
    notes: String,
    order: { type: Number, required: true },
    // Rich place data from Mapbox + Google Places validation
    rating: Number,
    priceLevel: Number,
    photoUrl: String,
    openingHours: String,
    openingHoursDetail: dayHoursSchema,
    // Distance validation flag — set when next activity is too far for chosen transport mode
    requiresTransport: { type: Boolean, default: false },
    distanceFromPrevious: Number,
    // Nearby food/snack suggestions cached from Google Places Nearby Search
    nearbySuggestions: [
      {
        name: String,
        placeId: String,
        distanceKm: Number,
        priceLevel: Number,
        photoUrl: String,
      },
    ],
  },
  { _id: true }, // Keep _id for individual activity updates
);

export const ItineraryDaySchema = new Schema<IItineraryDay>(
  {
    day: { type: Number, required: true },
    date: { type: Date, required: true },
    geoHash: String,
    activities: [ActivitySchema],
  },
  { _id: true },
);

export const StaySchema = new Schema(
  {
    placeId: { type: Schema.Types.ObjectId, ref: "Place" },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["hotel", "hostel", "airbnb", "other"],
      required: true,
    },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    pricePerNight: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    confirmationNumber: String,
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
  },
  { _id: true },
);

export const CityStopSchema = new Schema<ICityStop>(
  {
    cityId: {
      type: Schema.Types.ObjectId,
      ref: "City",
      required: true,
    },
    order: { type: Number, required: true },
    stayNights: { type: Number, required: true },
    stays: [StaySchema],
  },
  { _id: false },
);

/**
 * Generation provenance — the only persisted record of what actually
 * happened during a trip's AI generation (RAG hit/miss, model, token
 * usage). Previously this only ever existed as scattered [RAG_USED] log
 * lines; nothing was queryable. Optional/no top-level default so its
 * absence is meaningful (a trip generated before this field existed, or
 * one whose write failed) rather than a wall of zeros.
 */
export const GenerationMetaSchema = new Schema<IGenerationMeta>(
  {
    ragUsed: { type: Boolean, required: true },
    ragResultCount: { type: Number, required: true, default: 0 },
    ragAvgScore: { type: Number, default: null },
    ragFallbackReason: { type: String, default: null },
    model: { type: String, required: true },
    aiAttempts: { type: Number, required: true, default: 1 },
    unresolvedPlaceCount: { type: Number, required: true, default: 0 },
    promptTokens: { type: Number, default: null },
    totalTokens: { type: Number, default: null },
    latencyMs: { type: Number, default: null },
  },
  { _id: false },
);
