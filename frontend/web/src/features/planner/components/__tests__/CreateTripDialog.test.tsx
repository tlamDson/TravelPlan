import { describe, it, expect, beforeEach } from "vitest";
import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { CreateTripDialog } from "../CreateTripDialog";
import { useTripWizardStore } from "@/stores/trip-wizard.store";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";

const WIZARD_INITIAL = useTripWizardStore.getState();
const SUBSCRIPTION_INITIAL = useSubscriptionStore.getState();

beforeEach(() => {
  useTripWizardStore.setState(WIZARD_INITIAL, true);
  useSubscriptionStore.setState(SUBSCRIPTION_INITIAL, true);
  localStorage.clear();
  server.use(
    http.get("*/destinations", () =>
      HttpResponse.json({ success: true, countries: [] }),
    ),
  );
});

async function openDialog() {
  const user = userEvent.setup();
  renderWithProviders(
    <CreateTripDialog
      entryPoint="dashboard"
      trigger={<button>Open wizard</button>}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Open wizard" }));
  return user;
}

function setValidStep0Data() {
  act(() => {
    useTripWizardStore.getState().setData({
      title: "Weekend getaway",
      destination: "Da Nang, Vietnam",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
    });
  });
}

describe("CreateTripDialog — step 0 (Basics) gating", () => {
  it("disables Next when the form is empty", async () => {
    await openDialog();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("enables Next once title, destination, dates and travelers are valid", async () => {
    await openDialog();
    setValidStep0Data();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("keeps Next disabled when the title is too short", async () => {
    await openDialog();
    setValidStep0Data();
    act(() => {
      useTripWizardStore.getState().setData({ title: "A" });
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("CreateTripDialog — free-tier trip-duration upgrade gate", () => {
  it("swaps Next for an Upgrade button when a free user picks more than 5 days", async () => {
    await openDialog();
    act(() => {
      useTripWizardStore.getState().setData({
        title: "Long trip",
        destination: "Da Nang, Vietnam",
        startDate: "2026-06-01",
        endDate: "2026-06-10", // 9 days > 5
      });
    });
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    const upgradeButton = screen.getByRole("button", {
      name: /Upgrade to Continue/,
    });
    expect(upgradeButton).toBeInTheDocument();
  });

  it("opens the upgrade modal with reason=trip-duration when clicked", async () => {
    const user = await openDialog();
    act(() => {
      useTripWizardStore.getState().setData({
        title: "Long trip",
        destination: "Da Nang, Vietnam",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
    });
    await user.click(
      screen.getByRole("button", { name: /Upgrade to Continue/ }),
    );
    expect(useSubscriptionStore.getState().isUpgradeModalOpen).toBe(true);
    expect(useSubscriptionStore.getState().upgradeReason).toBe("trip-duration");
  });

  it("does not gate a pro user past 5 days", async () => {
    useSubscriptionStore.setState({ isPro: true });
    await openDialog();
    act(() => {
      useTripWizardStore.getState().setData({
        title: "Long trip",
        destination: "Da Nang, Vietnam",
        startDate: "2026-06-01",
        endDate: "2026-06-10",
      });
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});

describe("CreateTripDialog — Back / Reset", () => {
  it("disables Back on the first step and advances/returns correctly", async () => {
    const user = await openDialog();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    setValidStep0Data();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    // Data survives the round trip
    expect(useTripWizardStore.getState().data.title).toBe("Weekend getaway");
  });

  it("Reset clears the wizard data back to step 0", async () => {
    const user = await openDialog();
    setValidStep0Data();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(useTripWizardStore.getState().data.title).toBe("");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});

describe("CreateTripDialog — step 4 (Activities) gating", () => {
  it("disables Next until pace and at least one focus area are set", async () => {
    const user = await openDialog();
    setValidStep0Data();
    await user.click(screen.getByRole("button", { name: "Next" })); // -> step 1 (Budget)

    act(() => {
      useTripWizardStore.getState().setBudget({ total: 500, currency: "USD" });
    });
    await user.click(screen.getByRole("button", { name: "Next" })); // -> step 2 (Accommodation)

    act(() => {
      useTripWizardStore.getState().setData({ accommodationType: "hotel" });
    });
    await user.click(screen.getByRole("button", { name: "Next" })); // -> step 3 (Transport)

    act(() => {
      useTripWizardStore.getState().setData({ transportMode: "walking" });
    });
    await user.click(screen.getByRole("button", { name: "Next" })); // -> step 4 (Activities)

    act(() => {
      useTripWizardStore.getState().setData({ focus: [] });
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    act(() => {
      useTripWizardStore.getState().setData({ focus: ["Culture"] });
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
