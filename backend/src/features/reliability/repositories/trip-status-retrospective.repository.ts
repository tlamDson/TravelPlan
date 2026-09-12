import Trip from "../../planner/models/Trip";

export interface TripStatusDailyCount {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  status: string;
  count: number;
}

interface AggregateRow {
  _id: { date: string; status: string };
  count: number;
}

/**
 * Read-only retrospective query used by
 * backend/scripts/measure-false-healthy.ts's `--retrospective` mode to
 * measure the real gemini-2.0-flash false-healthy window (fixed in
 * commit f62baef, 2026-08-15) on production Trip data. Deliberately its
 * own repository under reliability/ rather than a new method on the
 * already-200+-line trip.repository.ts (see tech-defaults.md "Nợ kỹ
 * thuật" — that file already violates the Rule of 200).
 */
export class TripStatusRetrospectiveRepository {
  async countByStatusPerDay(
    since: Date,
    until: Date,
  ): Promise<TripStatusDailyCount[]> {
    const rows: AggregateRow[] = await Trip.aggregate([
      { $match: { createdAt: { $gte: since, $lt: until } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    return rows.map((row) => ({
      date: row._id.date,
      status: row._id.status,
      count: row.count,
    }));
  }
}

export const tripStatusRetrospectiveRepository =
  new TripStatusRetrospectiveRepository();
