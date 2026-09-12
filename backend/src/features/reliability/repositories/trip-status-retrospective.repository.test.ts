import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAggregate = vi.fn();

vi.mock("../../planner/models/Trip", () => ({
  default: {
    aggregate: (...args: unknown[]) => mockAggregate(...args),
  },
}));

import { tripStatusRetrospectiveRepository } from "./trip-status-retrospective.repository";

describe("tripStatusRetrospectiveRepository.countByStatusPerDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches Trip.createdAt in [since, until) and groups by UTC day + status — read-only, no write method used", async () => {
    mockAggregate.mockResolvedValue([]);
    const since = new Date("2026-07-01T00:00:00.000Z");
    const until = new Date("2026-08-15T00:00:00.000Z");

    await tripStatusRetrospectiveRepository.countByStatusPerDay(since, until);

    expect(mockAggregate).toHaveBeenCalledTimes(1);
    const pipeline = mockAggregate.mock.calls[0]![0] as Array<
      Record<string, unknown>
    >;
    expect(pipeline[0]).toEqual({
      $match: { createdAt: { $gte: since, $lt: until } },
    });
    const group = pipeline[1]!.$group as {
      _id: { date: unknown; status: string };
    };
    expect(group._id.status).toBe("$status");
  });

  it("maps aggregation rows into flat {date, status, count} records", async () => {
    mockAggregate.mockResolvedValue([
      { _id: { date: "2026-08-01", status: "FALLBACK" }, count: 3 },
      { _id: { date: "2026-08-01", status: "COMPLETED" }, count: 10 },
    ]);

    const result = await tripStatusRetrospectiveRepository.countByStatusPerDay(
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-02T00:00:00.000Z"),
    );

    expect(result).toEqual([
      { date: "2026-08-01", status: "FALLBACK", count: 3 },
      { date: "2026-08-01", status: "COMPLETED", count: 10 },
    ]);
  });
});
