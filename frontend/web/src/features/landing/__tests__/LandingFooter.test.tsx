import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { LandingFooter } from "../components/LandingFooter";

describe("LandingFooter", () => {
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
