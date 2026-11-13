import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { DashboardLayout } from "../DashboardLayout";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ signOut: vi.fn(), isLoaded: true, userId: null }),
  useUser: () => ({ user: null, isLoaded: true }),
}));
vi.mock("@/features/user/hooks/useUser", () => ({
  useUserMe: () => ({ data: undefined }),
}));
vi.mock("@/features/settings/components/SettingsModal", () => ({
  SettingsModal: () => null,
}));
vi.mock("@/features/planner/components/GlobalJobWatcher", () => ({
  GlobalJobWatcher: () => null,
}));

describe("DashboardLayout sidebar", () => {
  it("does not link to the in-development /assistant page", () => {
    renderWithProviders(<DashboardLayout>content</DashboardLayout>, {
      route: "/dashboard",
    });

    const nav = screen.getByRole("navigation");
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/dashboard", "/trips", "/map"]);
  });

  it("labels the AI Assistant entry as coming soon", () => {
    renderWithProviders(<DashboardLayout>content</DashboardLayout>, {
      route: "/dashboard",
    });

    const entry = screen.getByTestId("nav-ai-coming-soon");
    expect(entry).toHaveTextContent("AI Assistant");
    expect(entry).toHaveTextContent("Coming soon");
    expect(entry).toHaveAttribute("aria-disabled", "true");
  });
});
