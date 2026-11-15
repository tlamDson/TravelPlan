import AnalyticsEvent, { type IAnalyticsEvent } from "../models/AnalyticsEvent";

export class AnalyticsEventRepository {
  /**
   * Inserts the events whose eventId is not stored yet and returns how
   * many were new. Upsert + $setOnInsert (not insertMany) so an existing
   * id is a no-op instead of a duplicate-key error, and the unique index
   * makes concurrent writers of one id race-safe.
   */
  async insertNew(docs: IAnalyticsEvent[]): Promise<number> {
    const result = await AnalyticsEvent.bulkWrite(
      docs.map((doc) => ({
        updateOne: {
          filter: { eventId: doc.eventId },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return result.upsertedCount;
  }

  /**
   * Streams events with start <= occurredAt < end, ordered by occurredAt
   * then eventId so an export of the same data is byte-identical.
   */
  streamOccurredBetween(
    start: Date,
    end: Date,
  ): AsyncIterable<IAnalyticsEvent> {
    return AnalyticsEvent.find({ occurredAt: { $gte: start, $lt: end } })
      .sort({ occurredAt: 1, eventId: 1 })
      .lean<IAnalyticsEvent>()
      .cursor();
  }
}

export const analyticsEventRepository = new AnalyticsEventRepository();
