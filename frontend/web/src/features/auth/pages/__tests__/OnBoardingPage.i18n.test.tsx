import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import OnBoardingPage from "../OnBoardingPage";

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

const STEP_1_ENGLISH = [
  "Skip for now",
  "Let's set up your profile",
  "Choose how your name appears publicly when sharing trips.",
  "Public nickname / username",
  "Preferred currency",
  "US Dollar",
  "Back",
  "Next",
];
const STEP_2_ENGLISH = [
  "What do you love about traveling?",
  "Select your interests to get personalized recommendations.",
  "Your interests",
  "Adventure",
  "Food & Cuisine",
  "How do you usually travel?",
  "Solo Traveler",
  "Exploring on your own",
];
const STEP_3_ENGLISH = [
  "Plan your first trip",
  "Where would you like to go? (optional)",
  "Destination",
  "Number of travelers",
  "Complete Setup",
];

const INITIAL_STATE = useTranslationStore.getState();

function expectNoEnglish(copy: string[]) {
  for (const text of copy) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
}

describe("OnBoardingPage i18n", () => {
  beforeEach(() => useTranslationStore.setState(INITIAL_STATE, true));
  afterEach(() => useTranslationStore.setState(INITIAL_STATE, true));

  it.each([
    ["French", "Passer pour l'instant", "Suivant"],
    ["Vietnamese", "Bỏ qua lúc này", "Tiếp theo"],
  ] as const)(
    "renders no English copy on any step in %s",
    async (language, skip, next) => {
      const user = userEvent.setup();
      useTranslationStore.setState({ language });
      renderWithProviders(<OnBoardingPage />, { route: "/onboarding" });

      expect(screen.getByText(skip)).toBeInTheDocument();
      expectNoEnglish(STEP_1_ENGLISH);

      await user.click(screen.getByRole("button", { name: new RegExp(next) }));
      expectNoEnglish(STEP_2_ENGLISH);

      await user.click(screen.getByRole("button", { name: new RegExp(next) }));
      expectNoEnglish(STEP_3_ENGLISH);
    },
  );
});
