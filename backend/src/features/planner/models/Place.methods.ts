import { Schema, Types } from "mongoose";
import { logger } from "../../../lib/logger";
import type { IPlace, PlaceCategory } from "./Place.types";

export const attachPlaceMethods = (schema: Schema<IPlace>) => {
  /**
   * Find or create a place from an external source
   * Prevents duplicates by checking source + sourceId
   */
  schema.statics.findOrCreateFromSource = async function (
    source: IPlace["source"],
    sourceId: string,
    placeData: Partial<IPlace>,
  ) {
    const existing = await this.findOne({ source, sourceId });
    if (existing) {
      // Update if stale
      if (existing.isStale) {
        Object.assign(existing, placeData, {
          isStale: false,
          lastSyncedAt: new Date(),
        });
        return existing.save();
      }
      return existing;
    }

    return this.create({
      ...placeData,
      source,
      sourceId,
      lastSyncedAt: new Date(),
    });
  };

  /**
   * Find places near a location
   */
  schema.statics.findNearby = async function (
    lng: number,
    lat: number,
    maxDistanceMeters: number = 5000,
    category?: PlaceCategory,
  ) {
    const query: any = {
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: maxDistanceMeters,
        },
      },
      isActive: true,
    };

    if (category) {
      query.category = category;
    }

    return this.find(query);
  };

  /**
   * Semantic search using vector similarity
   * Note: Requires MongoDB Atlas with vector search enabled,
   * or you can use a separate vector DB like Pinecone
   */
  schema.statics.semanticSearch = async function (
    queryEmbedding: number[],
    cityId?: Types.ObjectId,
    limit: number = 10,
  ) {
    // This is a placeholder for vector search
    // In production, use MongoDB Atlas Vector Search or external vector DB
    // Example Atlas aggregation:
    /*
    return this.aggregate([
      {
        $vectorSearch: {
          index: "place_embedding_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 100,
          limit: limit,
          filter: cityId ? { cityId: cityId } : {}
        }
      }
    ]);
    */

    // Fallback to text search if vector search not available
    logger.warn("Vector search not configured - falling back to text search");
    return this.find({ isActive: true }).limit(limit);
  };

  /**
   * Mark places as stale for refresh
   */
  schema.statics.markStale = async function (olderThanDays: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.updateMany(
      { lastSyncedAt: { $lt: cutoffDate }, isStale: false },
      { isStale: true },
    );
  };
};
