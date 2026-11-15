import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { expectCatalogValid } from "@/test/analytics";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { GlobalJobWatcher } from "../GlobalJobWatcher";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { trackOnce } from "@/features/analytics";

const trackOnceMock = vi.mocked(trackOnce);

function serveJob(job: Record<string, unknown>) {
  server.use(
    http.get("*/jobs/:jobId", () =>
      HttpResponse.json({
        jobId: "job-1",
        progress: 100,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:01:30.000Z",
        ...job,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useActiveJobStore.getState().clearActiveJob();
});

describe("GlobalJobWatcher (trip_generation_completed)", () => {
  it.each([
    ["completed", { status: "COMPLETED", result: { status: "COMPLETED" } }],
    ["fallback", { status: "COMPLETED", result: { status: "FALLBACK" } }],
    ["failed", { status: "FAILED", error: "AI generation failed" }],
  ] as const)(
    "tracks a %s generation once per job, timed from enqueue to finish",
    async (outcome, job) => {
      serveJob(job);
      useActiveJobStore.getState().setActiveJob("job-1", "trip-1");

      renderWithProviders(<GlobalJobWatcher />);

      await waitFor(() =>
        expect(trackOnceMock).toHaveBeenCalledWith(
          "trip_generation_completed",
          { jobId: "job-1", tripId: "trip-1", outcome, durationMs: 90_000 },
          "job-1",
        ),
      );
      expectCatalogValid(trackOnceMock.mock.calls);
    },
  );

  it("never reports a negative duration from skewed timestamps", async () => {
    serveJob({
      status: "COMPLETED",
      createdAt: "2026-06-01T10:01:30.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
    });
    useActiveJobStore.getState().setActiveJob("job-1", "trip-1");

    renderWithProviders(<GlobalJobWatcher />);

    await waitFor(() => expect(trackOnceMock).toHaveBeenCalled());
    expect(trackOnceMock.mock.calls[0][1]).toMatchObject({ durationMs: 0 });
  });

  it("tracks nothing while no job is active", async () => {
    renderWithProviders(<GlobalJobWatcher />);

    await new Promise((r) => setTimeout(r, 20));
    expect(trackOnceMock).not.toHaveBeenCalled();
  });
});
