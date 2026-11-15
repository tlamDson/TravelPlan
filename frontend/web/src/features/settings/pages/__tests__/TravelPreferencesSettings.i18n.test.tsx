import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import {
  TRANSLATIONS,
  useTranslationStore,
} from "@/stores/useTranslationStore";
import { TravelPreferencesSettings } from "../TravelPreferencesSettings";

const INITIAL = useTranslationStore.getState();

afterEach(() => {
  useTranslationStore.setState(INITIAL, true);
});

const PANEL_KEYS = [
  "pref.aiDefaultsTitle",
  "pref.focusLabel",
  "pref.focusCulture",
  "pref.focusNature",
  "pref.focusGastronomy",
  "pref.focusLifestyle",
  "pref.groupLabel",
  "pref.groupSolo",
  "pref.groupCouple",
  "pref.groupFamily",
  "pref.groupFriends",
  "pref.groupWork",
  "pref.groupNone",
  "pref.transportLabel",
  "pref.transportWalking",
  "pref.transportPublic",
  "pref.transportCar",
  "pref.paceLabel",
  "pref.paceRelaxed",
  "pref.paceBalanced",
  "pref.pacePacked",
  "pref.mobilityFriendly",
  "pref.avoidCrowds",
  "pref.foodAsMain",
  "pref.specialRequirements",
  "pref.specialRequirementsPlaceholder",
  "pref.airportPlaceholder",
  "pref.mealsPlaceholder",
  "pref.toastSaved",
  "pref.toastSaveFailed",
];

describe("Travel Preferences panel strings are in every dictionary", () => {
  it.each(Object.keys(TRANSLATIONS))("%s defines every panel key", (lang) => {
    const dict = TRANSLATIONS[lang as keyof typeof TRANSLATIONS];
    const missing = PANEL_KEYS.filter((k) => !dict[k]);
    expect(missing).toEqual([]);
  });
});

describe("TravelPreferencesSettings follows the UI language", () => {
  it("renders the previously hardcoded strings in English", () => {
    useTranslationStore.setState({ language: "English (US)" });
    renderWithProviders(<TravelPreferencesSettings />);

    expect(screen.getByText("AI Trip Defaults")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    expect(screen.getByText("Food as main activities")).toBeInTheDocument();
  });

  it("renders the previously hardcoded strings in Vietnamese", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    renderWithProviders(<TravelPreferencesSettings />);

    expect(screen.queryByText("AI Trip Defaults")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Food as main activities"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "None" })).toBeNull();

    expect(
      screen.getByText(TRANSLATIONS.Vietnamese["pref.aiDefaultsTitle"]),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: TRANSLATIONS.Vietnamese["pref.groupNone"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(TRANSLATIONS.Vietnamese["pref.foodAsMain"]),
    ).toBeInTheDocument();
    // Option labels and pace buttons are translated too, not just the three headlines.
    expect(screen.queryByText("Group Type")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^relaxed$/i })).toBeNull();
  });

  it("renders the panel strings in French", () => {
    useTranslationStore.setState({ language: "French" });
    renderWithProviders(<TravelPreferencesSettings />);

    expect(screen.queryByText("AI Trip Defaults")).not.toBeInTheDocument();
    expect(
      screen.getByText(TRANSLATIONS.French["pref.aiDefaultsTitle"]),
    ).toBeInTheDocument();
  });
});
