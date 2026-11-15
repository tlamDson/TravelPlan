import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import { TripCard } from "../TripCard";
import { makeActivity, makeTrip } from "@/test/factories/trip";

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

  it("falls back to the first itinerary place photo when the destination has no country image", () => {
    const trip = makeTrip({
      title: "Trip to Kyoto",
      destination: "Kyoto",
      coverImage: undefined,
      itinerary: [
        {
          day: 1,
          date: "2026-06-01T00:00:00.000Z",
          activities: [
            makeActivity({ _id: "a1", name: "No photo" }),
            makeActivity({
              _id: "a2",
              name: "Fushimi Inari",
              photoUrl: "https://example.com/fushimi.jpg",
            }),
          ],
        },
      ],
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/fushimi.jpg",
    );
  });

  it("prefers the explicit cover image over a place photo", () => {
    const trip = makeTrip({
      title: "Trip to Kyoto",
      destination: "Kyoto",
      coverImage: "https://example.com/cover.jpg",
      itinerary: [
        {
          day: 1,
          date: "2026-06-01T00:00:00.000Z",
          activities: [
            makeActivity({ photoUrl: "https://example.com/fushimi.jpg" }),
          ],
        },
      ],
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/cover.jpg",
    );
  });

  it("keeps the country image over a place photo when the country has images", () => {
    const trip = makeTrip({
      title: "Trip to Paris, France",
      destination: "Paris, France",
      coverImage: undefined,
      itinerary: [
        {
          day: 1,
          date: "2026-06-01T00:00:00.000Z",
          activities: [
            makeActivity({ photoUrl: "https://example.com/louvre.jpg" }),
          ],
        },
      ],
    });
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringMatching(/\/images\/countries\/france_/),
    );
  });
});
