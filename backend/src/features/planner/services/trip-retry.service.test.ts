import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetJob = vi.fn();
const mockAdd = vi.fn();
vi.mock("../../../lib/queue", () => ({
  createQueue: vi.fn(() => ({
    getJob: (...args: unknown[]) => mockGetJob(...args),
    add: (...args: unknown[]) => mockAdd(...args),
  })),
}));

const mockFindById = vi.fn();
const mockForceAcquireLock = vi.fn();
const mockUpdateStatus = vi.fn();
vi.mock("../repositories/trip.repository", () => ({
  tripRepository: {
    findById: (...args: unknown[]) => mockFindById(...args),
    forceAcquireLock: (...args: unknown[]) => mockForceAcquireLock(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  },
}));

import { retryTripJobForUser } from "./trip-retry.service";

describe("retryTripJobForUser", () => {
  const makeJob = (overrides: Record<string, unknown> = {}) => ({
    id: "old-job-1",
    name: "generate-trip",
    data: {
      userId: "user-1",
      tripId: "trip-1",
      preferences: { destination: "Hanoi" },
      language: "en",
      userTier: "pro",
    },
    opts: { priority: 1 },
    getState: vi.fn().mockResolvedValue("failed"),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: "new-job-1" });
    mockFindById.mockResolvedValue({ _id: "trip-1" });
    mockForceAcquireLock.mockResolvedValue({ _id: "trip-1" });
    mockUpdateStatus.mockResolvedValue(undefined);
  });

  it("retries with the same attempts + exponential backoff as a fresh submission", async () => {
    // Before this fix, retryTripJobForUser passed no options at all to
    // add(), so a retried job silently got BullMQ's 1-attempt default —
    // one more transient failure and it was permanently dead, unlike a
    // freshly submitted trip which gets 3 attempts.
    mockGetJob.mockResolvedValue(makeJob());

    await retryTripJobForUser("old-job-1", "user-1");

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.any(Object),
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }),
    );
  });

  it("carries userTier through to the retried job", async () => {
    // trip.processor.ts gates the static-fallback path AND worker.ts gates
    // the pro credit-refund on `userTier` — dropping it here meant a
    // retried job could never fall back and a retried pro job could never
    // be refunded after exhausting retries.
    mockGetJob.mockResolvedValue(makeJob());

    await retryTripJobForUser("old-job-1", "user-1");

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.objectContaining({ userTier: "pro" }),
      expect.any(Object),
    );
  });

  it("defaults userTier to 'free' when the original job predates the field", async () => {
    // Jobs enqueued before userTier existed on the payload shape must not
    // crash the retry — fall back to the safer (non-pro) tier rather than
    // passing userTier: undefined through to trip.processor.ts's gates.
    mockGetJob.mockResolvedValue(
      makeJob({
        data: {
          userId: "user-1",
          tripId: "trip-1",
          preferences: { destination: "Hanoi" },
          language: "en",
        },
      }),
    );

    await retryTripJobForUser("old-job-1", "user-1");

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.objectContaining({ userTier: "free" }),
      expect.any(Object),
    );
  });

  it("preserves the original job's priority (pro stays priority 1)", async () => {
    mockGetJob.mockResolvedValue(makeJob());

    await retryTripJobForUser("old-job-1", "user-1");

    expect(mockAdd).toHaveBeenCalledWith(
      "generate-trip",
      expect.any(Object),
      expect.objectContaining({ priority: 1 }),
    );
  });

  it("omits priority entirely (rather than passing undefined) when the original job had none", async () => {
    // exactOptionalPropertyTypes rejects `priority: undefined` as distinct
    // from an absent key — this also protects against accidentally
    // overriding BullMQ's own priority handling with an explicit undefined.
    mockGetJob.mockResolvedValue(makeJob({ opts: {} }));

    await retryTripJobForUser("old-job-1", "user-1");

    const [, , options] = mockAdd.mock.calls[0] as [
      unknown,
      unknown,
      Record<string, unknown>,
    ];
    expect(options).not.toHaveProperty("priority");
  });
});
