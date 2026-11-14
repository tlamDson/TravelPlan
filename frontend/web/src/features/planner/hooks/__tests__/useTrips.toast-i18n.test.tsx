import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { renderHookWithQuery } from "@/test/renderHookWithQuery";
import { makeTrip } from "@/test/factories/trip";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useUpdateTrip, useDeleteTrip } from "../useTrips";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("../../api/trips.api", async (importActual) => ({
  ...(await importActual<typeof import("../../api/trips.api")>()),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
}));
vi.mock("@/features/analytics", () => ({
  track: vi.fn(),
  trackOnce: vi.fn(),
}));
import { toast } from "sonner";
import * as tripsApi from "../../api/trips.api";

const INITIAL = useTranslationStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tripsApi.updateTrip).mockResolvedValue(makeTrip());
  vi.mocked(tripsApi.deleteTrip).mockResolvedValue(undefined);
});

afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

describe("trip toasts follow the UI language", () => {
  it("rename toast reads English, then Vietnamese after switching locale", async () => {
    useTranslationStore.setState({ language: "English (US)" });
    const { result } = renderHookWithQuery(() => useUpdateTrip());

    await act(async () => {
      await result.current.mutateAsync({ tripId: "t1", data: {} });
    });
    expect(toast.success).toHaveBeenLastCalledWith("Trip updated!");

    act(() => useTranslationStore.setState({ language: "Vietnamese" }));
    await act(async () => {
      await result.current.mutateAsync({ tripId: "t1", data: {} });
    });
    expect(toast.success).toHaveBeenLastCalledWith("Đã cập nhật chuyến đi!");
  });

  it("delete toast reads English, then Vietnamese after switching locale", async () => {
    useTranslationStore.setState({ language: "English (US)" });
    const { result } = renderHookWithQuery(() => useDeleteTrip());

    await act(async () => {
      await result.current.mutateAsync("t1");
    });
    expect(toast.success).toHaveBeenLastCalledWith("Trip deleted");

    act(() => useTranslationStore.setState({ language: "Vietnamese" }));
    await act(async () => {
      await result.current.mutateAsync("t1");
    });
    expect(toast.success).toHaveBeenLastCalledWith("Đã xóa chuyến đi");
  });

  it("falls back to a translated message when the error has no text", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    vi.mocked(tripsApi.deleteTrip).mockRejectedValue(new Error(""));
    const { result } = renderHookWithQuery(() => useDeleteTrip());

    await act(async () => {
      await result.current.mutateAsync("t1").catch(() => undefined);
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenLastCalledWith("Không thể xóa chuyến đi");
  });
});
