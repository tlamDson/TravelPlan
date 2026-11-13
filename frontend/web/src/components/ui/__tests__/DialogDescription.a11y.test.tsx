import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpgradeModal } from "@/components/pro/UpgradeModal";
import { SettingsModal } from "@/features/settings/components/SettingsModal";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

vi.mock("@/lib/axios", () => ({ apiClient: { post: vi.fn() } }));

// The tab bodies need Clerk/Query providers and are irrelevant here.
vi.mock("@/features/settings/pages/PersonalInfoSettings", () => ({
  PersonalInfoSettings: () => null,
}));
vi.mock("@/features/settings/pages/SecuritySettings", () => ({
  SecuritySettings: () => null,
}));
vi.mock("@/features/settings/pages/LocalizationSettings", () => ({
  LocalizationSettings: () => null,
}));
vi.mock("@/features/settings/pages/AppearanceSettings", () => ({
  AppearanceSettings: () => null,
}));
vi.mock("@/features/settings/pages/AiAssistantSettings", () => ({
  AiAssistantSettings: () => null,
}));
vi.mock("@/features/settings/pages/TravelPreferencesSettings", () => ({
  TravelPreferencesSettings: () => null,
}));
vi.mock("@/features/settings/pages/SubscriptionSettings", () => ({
  SubscriptionSettings: () => null,
}));

/**
 * [Guard] Radix warns "Missing `Description` or `aria-describedby={undefined}`
 * for {DialogContent}" when a dialog has neither a description nor an explicit
 * opt-out. Seen on the trips page of staging (2026-11-13): the global Settings
 * and Upgrade dialogs had a title only.
 */
const INITIAL_SUBSCRIPTION_STATE = useSubscriptionStore.getState();

function describedByWarnings(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.filter((args: unknown[]) =>
    args.some(
      (a) =>
        typeof a === "string" &&
        /Missing `?Description`?|aria-describedby/.test(a),
    ),
  );
}

describe("dialog description a11y warnings", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useSubscriptionStore.setState(INITIAL_SUBSCRIPTION_STATE, true);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("UpgradeModal is described by its reason text and logs no warning", () => {
    useSubscriptionStore.setState({ isUpgradeModalOpen: true });
    render(<UpgradeModal />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(describedByWarnings(errorSpy)).toHaveLength(0);
    expect(describedByWarnings(warnSpy)).toHaveLength(0);
  });

  it("SettingsModal logs no missing-description warning", () => {
    render(<SettingsModal isOpen onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(describedByWarnings(errorSpy)).toHaveLength(0);
    expect(describedByWarnings(warnSpy)).toHaveLength(0);
  });
});
