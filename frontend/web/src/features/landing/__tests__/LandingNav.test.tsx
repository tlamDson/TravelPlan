import { afterEach, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { LandingNav } from "../components/LandingNav";

describe("LandingNav", () => {
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  it("shows English labels by default", () => {
    renderWithProviders(<LandingNav />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get Started" }),
    ).toBeInTheDocument();
  });

  it.each(["French", "Vietnamese"] as const)(
    "translates Sign in and Get Started in %s",
    (language) => {
      useTranslationStore.setState({ language });
      renderWithProviders(<LandingNav />);
      const { t } = useTranslationStore.getState();
      expect(
        screen.queryByRole("button", { name: "Sign in" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Get Started" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: t("landing.nav.signIn") }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: t("landing.nav.getStarted") }),
      ).toBeInTheDocument();
      expect(t("landing.nav.signIn")).not.toBe("landing.nav.signIn");
    },
  );
});
