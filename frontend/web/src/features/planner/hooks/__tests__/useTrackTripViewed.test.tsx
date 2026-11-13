import { StrictMode, type ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectCatalogValid } from "@/test/analytics";
import { useTrackTripViewed } from "../useTrackTripViewed";

vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { track } from "@/features/analytics";

const trackMock = vi.mocked(track);

beforeEach(() => {
  trackMock.mockClear();
});

describe("useTrackTripViewed (trip_viewed)", () => {
  it("waits until the trip has loaded", () => {
    renderHook(() => useTrackTripViewed(undefined));

    expect(trackMock).not.toHaveBeenCalled();
  });

  it("tracks the loaded trip once, however often the page re-renders", () => {
    const { rerender } = renderHook(() => useTrackTripViewed("trip-1"));
    rerender();
    rerender();

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("trip_viewed", { tripId: "trip-1" });
    expectCatalogValid(trackMock.mock.calls);
  });

  it("tracks again when the page moves to another trip", () => {
    const { rerender } = renderHook(({ id }) => useTrackTripViewed(id), {
      initialProps: { id: "trip-1" as string | undefined },
    });
    rerender({ id: "trip-2" });

    expect(trackMock.mock.calls.map((c) => c[1])).toEqual([
      { tripId: "trip-1" },
      { tripId: "trip-2" },
    ]);
  });

  it("does not double count under StrictMode's effect replay", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    renderHook(() => useTrackTripViewed("trip-1"), { wrapper });

    expect(trackMock).toHaveBeenCalledTimes(1);
  });
});
