import { describe, it, expect, afterEach } from "vitest";
import {
  useTranslationStore,
  TRANSLATIONS,
} from "@/stores/useTranslationStore";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import LandingPage from "../pages/LandingPage";
import { HeroSection } from "../components";

// Half of the hero text column (`max-w-3xl` = 48rem).
const HALF_TEXT_COLUMN_REM = 24;

describe("LandingPage honest copy", () => {
  it("does not claim an unverified user count", () => {
    renderWithProviders(<LandingPage />);
    expect(screen.queryByText(/10,000/)).toBeNull();
    expect(screen.queryByText(/Join \d/i)).toBeNull();
  });

  it("does not show fabricated testimonials or star ratings", () => {
    const { container } = renderWithProviders(<LandingPage />);
    expect(screen.queryByText(/loved by travelers/i)).toBeNull();
    expect(screen.queryByText("Sarah Chen")).toBeNull();
    expect(screen.queryByText("Marcus Williams")).toBeNull();
    expect(screen.queryByText("Emma Rodriguez")).toBeNull();
    expect(container.querySelector("svg.lucide-star")).toBeNull();
  });
});

describe("HeroSection floating destination cards", () => {
  it("anchors every card outside the centred text column at any width", () => {
    renderWithProviders(<HeroSection />);
    const cards = screen.getAllByTestId("hero-destination-card");
    expect(cards).toHaveLength(3);

    for (const card of cards) {
      // Percentage-of-hero `left` values (e.g. 45%) land on the text at wide
      // viewports; cards must hang off the column edge instead.
      expect(card.style.left).toBe("");
      const match = card.className.match(
        /(?:^|\s)(?:left|right)-\[calc\(50%\+(\d+(?:\.\d+)?)rem\)\]/,
      );
      expect(
        match,
        `card "${card.textContent}" is not column-anchored`,
      ).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(HALF_TEXT_COLUMN_REM);
    }
  });

  it("only shows the cards when both side gutters can hold them (xl and up)", () => {
    renderWithProviders(<HeroSection />);
    for (const card of screen.getAllByTestId("hero-destination-card")) {
      expect(card.className).toContain("xl:block");
      expect(card.className).not.toContain("lg:block");
    }
  });
});

describe("LandingPage translations", () => {
  afterEach(() => {
    useTranslationStore.setState({ language: "English (US)" });
  });

  it.each(["French", "Vietnamese"] as const)(
    "renders the new hero tagline and highlights in %s",
    (language) => {
      useTranslationStore.setState({ language });
      renderWithProviders(<LandingPage />);
      const dict = TRANSLATIONS[language];
      expect(screen.getByText(dict["landing.hero.tagline"])).toBeTruthy();
      expect(screen.getByText(dict["landing.highlights.title"])).toBeTruthy();
      expect(
        screen.queryByText("AI drafts your itinerary. You stay in control."),
      ).toBeNull();
    },
  );
});
