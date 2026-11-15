import mongoose, { Schema, Document } from "mongoose";

export interface IPlaceInsight extends Document {
  countryIdKey: string;
  cityIdKey: string;
  name: string;
  category: "food" | "history" | "nightlife" | "nature" | "shopping" | "other";
  description: string;
  tags: string[];
  /** Vector embedding for semantic search. 3072 dims (gemini-embedding-001) */
  embedding: number[];
  sourceQuery: string; // e.g. "best local food Tokyo"
  createdAt: Date;
  updatedAt: Date;
}

const PlaceInsightSchema = new Schema<IPlaceInsight>(
  {
    countryIdKey: { type: String, required: true, index: true },
    cityIdKey: { type: String, required: true, index: true },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["food", "history", "nightlife", "nature", "shopping", "other"],
      required: true,
    },
    description: { type: String, required: true },
    tags: { type: [String], default: [] },
    embedding: {
      type: [Number],
      required: true,
      select: false,
    },
    sourceQuery: { type: String, required: true },
  },
  { timestamps: true }
);

// Compound index for city lookup (non-vector)
PlaceInsightSchema.index({ countryIdKey: 1, cityIdKey: 1 });

// UNIQUE: Idempotency key — avoids duplicates when the worker runs periodically
PlaceInsightSchema.index({ cityIdKey: 1, name: 1 }, { unique: true });

export const PlaceInsight = mongoose.model<IPlaceInsight>("PlaceInsight", PlaceInsightSchema);
