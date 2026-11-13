import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { HowItWorksSection } from "../components/HowItWorksSection";
import { useTranslationStore } from "@/stores/useTranslationStore";

function renderLanding() {
  return render(
    <MemoryRouter>
      <HeroSection />
      <HowItWorksSection />
    </MemoryRouter>,
  );
}

describe("HeroSection secondary CTA", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks the How it works section with the id the CTA targets", () => {
    renderLanding();
    const section = document.getElementById("how-it-works");
    expect(section).not.toBeNull();
    expect(section).toHaveTextContent("How it works");
  });

  it("scrolls to the How it works section when clicked", async () => {
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    renderLanding();

    await userEvent.click(screen.getByTestId("hero-how-it-works-cta"));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.instances[0]).toBe(
      document.getElementById("how-it-works"),
    );
  });

  it("scrolls instantly when the user prefers reduced motion", async () => {
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
        }) as MediaQueryList,
    );
    renderLanding();

    await userEvent.click(screen.getByTestId("hero-how-it-works-cta"));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto" });
  });

  it("scrolls smoothly when reduced motion is not requested", async () => {
    const scrollSpy = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    renderLanding();

    await userEvent.click(screen.getByTestId("hero-how-it-works-cta"));

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  it.each([
    ["English (US)", "See How It Works"],
    ["French", "Voir comment ça marche"],
    ["Vietnamese", "Xem cách hoạt động"],
  ] as const)("labels the CTA in %s", (language, label) => {
    useTranslationStore.setState({ language });
    renderLanding();
    expect(screen.getByTestId("hero-how-it-works-cta")).toHaveTextContent(
      label,
    );
  });
});
