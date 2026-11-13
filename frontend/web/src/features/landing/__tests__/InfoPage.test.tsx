import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppRouter } from "@/app/router";
import {
  TRANSLATIONS,
  useTranslationStore,
} from "@/stores/useTranslationStore";
import { INFO_PAGE_KEYS } from "../constants/info-page-translations";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<AppRouter />);
}

describe("public info pages", () => {
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  it.each([
    ["/about", "About TravelPlan"],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ])("%s renders its page, not the 404", (path, heading) => {
    renderAt(path);
    expect(
      screen.getByRole("heading", { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("public info pages i18n", () => {
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  it.each(["French", "Vietnamese"] as const)(
    "/about heading follows the selected language (%s)",
    (language) => {
      useTranslationStore.setState({ language });
      renderAt("/about");
      expect(
        screen.queryByRole("heading", { level: 1, name: "About TravelPlan" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        useTranslationStore.getState().t("landing.about.title"),
      );
    },
  );

  it("every info-page key exists in English, French and Vietnamese", () => {
    for (const language of ["English (US)", "French", "Vietnamese"] as const) {
      for (const key of INFO_PAGE_KEYS) {
        expect(TRANSLATIONS[language][key], `${language}: ${key}`).toBeTruthy();
      }
    }
  });
});
