import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { WizardDestinationPickers } from "../WizardDestinationPickers";
import { useTripWizardStore } from "@/stores/trip-wizard.store";
import { useTranslationStore } from "@/stores/useTranslationStore";
import type { DestinationCountry } from "@/features/planner/api/destinations.api";

const WIZARD_INITIAL = useTripWizardStore.getState();

// The API only has English names for most countries: `name` equals `nameEn`.
const COUNTRIES: DestinationCountry[] = [
  {
    idKey: "jp",
    name: "Japan",
    nameEn: "Japan",
    flagEmoji: "🇯🇵",
    isSupported: false,
    cities: [],
  },
  {
    idKey: "fr",
    name: "France",
    nameEn: "France",
    flagEmoji: "🇫🇷",
    isSupported: false,
    cities: [],
  },
];

beforeEach(() => {
  useTripWizardStore.setState(WIZARD_INITIAL, true);
  server.use(
    http.get("*/destinations", () =>
      HttpResponse.json({ success: true, countries: COUNTRIES }),
    ),
  );
});

afterEach(() => {
  useTranslationStore.setState({ language: "English (US)" });
});

async function openCountryPicker() {
  const user = userEvent.setup();
  renderWithProviders(<WizardDestinationPickers />);
  await waitFor(() => screen.getByRole("combobox"));
  await user.click(screen.getByRole("combobox"));
  return user;
}

describe("country picker — UI language", () => {
  it("lists country names in Vietnamese when the UI is Vietnamese", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    await openCountryPicker();

    expect(
      await screen.findByRole("option", { name: /Nhật Bản/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Japan/ }),
    ).not.toBeInTheDocument();
  });

  it("finds a country by its Vietnamese name", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    const user = await openCountryPicker();

    await user.type(screen.getByPlaceholderText("Tìm quốc gia…"), "Nhật");

    expect(
      await screen.findByRole("option", { name: /Nhật Bản/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Pháp/ }),
    ).not.toBeInTheDocument();
  });

  it("still finds a country by its English name in Vietnamese", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    const user = await openCountryPicker();

    await user.type(screen.getByPlaceholderText("Tìm quốc gia…"), "Japan");

    expect(
      await screen.findByRole("option", { name: /Nhật Bản/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Pháp/ }),
    ).not.toBeInTheDocument();
  });

  it("lists country names in French when the UI is French", async () => {
    useTranslationStore.setState({ language: "French" });
    await openCountryPicker();

    expect(
      await screen.findByRole("option", { name: /Japon/ }),
    ).toBeInTheDocument();
  });

  it("shows the selected country in Vietnamese on the trigger", async () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    const user = await openCountryPicker();

    await user.click(await screen.findByRole("option", { name: /Nhật Bản/ }));

    await waitFor(() =>
      expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("Nhật Bản"),
    );
  });
});
