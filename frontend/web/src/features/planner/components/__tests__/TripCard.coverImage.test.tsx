import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { TripCard } from "../TripCard";
import { makeTrip } from "@/test/factories/trip";

describe("TripCard cover image", () => {
  it("never shows another country's image for a destination without images", () => {
    const trip = makeTrip({
      title: "Trip to Tokyo, Japan",
      destination: "Tokyo, Japan",
      coverImage: undefined,
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the matching country image when the destination is known", () => {
    const trip = makeTrip({
      title: "Trip to Paris, France",
      destination: "Paris, France",
      coverImage: undefined,
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringMatching(/\/images\/countries\/france_/),
    );
  });

  it("never shows a Vietnam image for a Japanese city that shares a Vietnamese alias", () => {
    const trip = makeTrip({
      title: "Trip to Hue, Japan",
      destination: "Hue, Japan",
      coverImage: undefined,
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.queryByRole("img")).toBeNull();
  });
});
