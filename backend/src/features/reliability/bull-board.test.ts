import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateBullBoard = vi.fn();
vi.mock("@bull-board/api", () => ({
  createBullBoard: (...args: unknown[]) => mockCreateBullBoard(...args),
}));

const mockBullMQAdapter = vi.fn();
vi.mock("@bull-board/api/bullMQAdapter", () => ({
  BullMQAdapter: vi.fn(function MockBullMQAdapter(
    this: unknown,
    ...args: unknown[]
  ) {
    mockBullMQAdapter(...args);
  }),
}));

const mockSetBasePath = vi.fn();
const mockGetRouter = vi.fn().mockReturnValue({ isRouter: true });
// A named function (not an arrow function) so `new ExpressAdapter()` in
// the implementation under test actually works — arrow functions can't
// be used as constructors.
vi.mock("@bull-board/express", () => ({
  ExpressAdapter: vi.fn(function MockExpressAdapter(this: unknown) {
    return { setBasePath: mockSetBasePath, getRouter: mockGetRouter };
  }),
}));

vi.mock("../planner/trip.queue", () => ({
  tripQueue: { __brand: "trip-generation" },
}));
vi.mock("../calendar/calendar.queue", () => ({
  calendarSyncQueue: { __brand: "sync-google-calendar" },
}));
vi.mock("../destinations/jobs/insight-queue", () => ({
  insightQueue: { __brand: "insight-scraper" },
}));

import { createBullBoardRouter } from "./bull-board";
import { QUEUE_NAMES } from "../../lib/queue-defaults";

describe("createBullBoardRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds exactly one BullMQAdapter per canonical queue in QUEUE_NAMES", () => {
    // A queue added later but not registered here would be invisible in
    // Bull Board — this pins the count to the single source of truth
    // rather than a hand-maintained literal list.
    createBullBoardRouter();
    expect(mockBullMQAdapter).toHaveBeenCalledTimes(
      Object.keys(QUEUE_NAMES).length,
    );
  });

  it("passes all built adapters to createBullBoard", () => {
    createBullBoardRouter();
    const [config] = mockCreateBullBoard.mock.calls[0] as [
      { queues: unknown[] },
    ];
    expect(config.queues).toHaveLength(3);
  });

  it("sets the base path to /admin/queues", () => {
    createBullBoardRouter();
    expect(mockSetBasePath).toHaveBeenCalledWith("/admin/queues");
  });

  it("returns the router from the server adapter", () => {
    const router = createBullBoardRouter();
    expect(router).toEqual({ isRouter: true });
  });
});
