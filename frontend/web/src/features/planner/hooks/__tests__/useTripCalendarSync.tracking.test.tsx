import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { expectCatalogValid } from "@/test/analytics";
import { useTripCalendarSync } from "../useTripCalendarSync";

const mockUser = {
  primaryEmailAddress: { emailAddress: "vip@example.com" },
  externalAccounts: [
    { provider: "google", reauthorize: vi.fn().mockResolvedValue(undefined) },
  ],
  reload: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: mockUser, isLoaded: true }),
}));
vi.mock("@/lib/vip-check", () => ({ isVipUser: () => true }));
vi.mock("../../api/calendar.api", () => ({ syncTripToCalendar: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { syncTripToCalendar } from "../../api/calendar.api";
import { track } from "@/features/analytics";

const trackMock = vi.mocked(track);
const syncMock = vi.mocked(syncTripToCalendar);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("calendar_synced", () => {
  it("is tracked once the server accepts the Google Calendar sync", async () => {
    syncMock.mockResolvedValue({ message: "ok" });
    const { result } = renderHookWithQuery(() => useTripCalendarSync("trip-1"));

    await act(async () => {
      await result.current.handleSync();
    });

    await waitFor(() =>
      expect(trackMock).toHaveBeenCalledWith("calendar_synced", {
        tripId: "trip-1",
        provider: "google",
      }),
    );
    expectCatalogValid(trackMock.mock.calls);
  });

  it("is not tracked when the server refuses the sync", async () => {
    syncMock.mockRejectedValue({
      response: { status: 400, data: { code: "GOOGLE_NOT_CONNECTED" } },
    });
    const { result } = renderHookWithQuery(() => useTripCalendarSync("trip-1"));

    await act(async () => {
      await result.current.handleSync();
    });

    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    expect(trackMock).not.toHaveBeenCalled();
  });
});
