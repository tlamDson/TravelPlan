import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { findEnglishLeaks } from "@/test/englishLeaks";
import { DeviceSessions } from "../DeviceSessions";

const NOW = new Date("2026-11-14T12:00:00Z");
const revokeOther = vi.fn();
const getSessions = vi.fn();

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: { id: "user_1", getSessions } }),
  useSession: () => ({ session: { id: "sess_current" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeSessions() {
  return [
    {
      id: "sess_current",
      status: "active",
      lastActiveAt: new Date(NOW.getTime() - 1000),
      latestActivity: {
        browserName: "Chrome",
        deviceType: "Windows",
        city: "Ho Chi Minh City",
        country: "Vietnam",
        isMobile: false,
      },
      revoke: vi.fn(),
    },
    {
      id: "sess_phone",
      status: "active",
      lastActiveAt: new Date(NOW.getTime() - 2 * 3600_000),
      latestActivity: {
        browserName: "Safari",
        deviceType: "iPhone",
        city: "Hanoi",
        country: "Vietnam",
        isMobile: true,
      },
      revoke: revokeOther,
    },
  ];
}

describe("DeviceSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    useTranslationStore.setState({ language: "Vietnamese" });
    getSessions.mockResolvedValue(makeSessions());
    revokeOther.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    useTranslationStore.setState({ language: "English (US)" });
    vi.clearAllMocks();
  });

  it("shows the real Clerk sessions, not the hardcoded placeholders", async () => {
    renderWithProviders(<DeviceSessions />);
    expect(await screen.findByText(/Safari/)).toBeInTheDocument();
    expect(screen.getByText(/Hanoi/)).toBeInTheDocument();
    expect(screen.queryByText(/MacBook Pro/)).toBeNull();
    expect(screen.queryByText(/New York/)).toBeNull();
  });

  it("formats times in Vietnamese with no English leaks", async () => {
    const { container } = renderWithProviders(<DeviceSessions />);
    await screen.findByText(/Safari/);
    expect(screen.getByText(/2 giờ trước/)).toBeInTheDocument();
    expect(screen.getByText(/Đang hoạt động/)).toBeInTheDocument();
    expect(findEnglishLeaks(container, "Vietnamese")).toEqual([]);
  });

  it("offers revoke only for other sessions and calls Clerk", async () => {
    renderWithProviders(<DeviceSessions />);
    await screen.findByText(/Safari/);
    const buttons = screen.getAllByRole("button", { name: "Thu hồi" });
    expect(buttons).toHaveLength(1);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      buttons[0],
    );
    await waitFor(() => expect(revokeOther).toHaveBeenCalledTimes(1));
  });

  it("shows a localized error when sessions cannot be loaded", async () => {
    getSessions.mockRejectedValue(new Error("network"));
    renderWithProviders(<DeviceSessions />);
    expect(
      await screen.findByText("Không thể tải danh sách thiết bị."),
    ).toBeInTheDocument();
  });
});
