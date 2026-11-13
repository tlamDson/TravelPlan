import { afterEach, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { LandingFooter } from "../components/LandingFooter";

describe("LandingFooter", () => {
  afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

  it("translates the link labels", () => {
    useTranslationStore.setState({ language: "Vietnamese" });
    renderWithProviders(<LandingFooter />);
    expect(
      screen.queryByRole("link", { name: "About" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: useTranslationStore.getState().t("landing.footer.about"),
      }),
    ).toHaveAttribute("href", "/about");
  });

  it("links About, Privacy and Terms to real pages", () => {
    renderWithProviders(<LandingFooter />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("has no placeholder '#' or empty links", () => {
    renderWithProviders(<LandingFooter />);
    for (const link of screen.getAllByRole("link")) {
      expect(["#", ""]).not.toContain(link.getAttribute("href"));
    }
  });
});
