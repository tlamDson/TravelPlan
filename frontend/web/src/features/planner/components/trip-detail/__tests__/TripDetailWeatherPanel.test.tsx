import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/renderWithProviders";
import { useTranslationStore } from "@/stores/useTranslationStore";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

import { TripDetailWeatherPanel } from "../TripDetailWeatherPanel";

const forecastBody = {
  city: { timezone: 0 },
  list: [
    {
      dt: Date.UTC(2026, 10, 14, 12) / 1000,
      dt_txt: "2026-11-14 12:00:00",
      main: { temp_min: 21.4, temp_max: 28.6 },
      weather: [{ main: "Clouds", description: "broken clouds", icon: "04d" }],
    },
  ],
};

describe("TripDetailWeatherPanel", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("shows the forecast fetched through the backend proxy", async () => {
    server.use(
      http.get("*/api/weather/forecast", () => HttpResponse.json(forecastBody)),
    );

    renderWithProviders(
      <TripDetailWeatherPanel
        destination="Da Nang"
        activeDayDate="2026-11-14T00:00:00.000Z"
      />,
    );

    expect(await screen.findByText("29C / 21C")).toBeInTheDocument();
    expect(screen.getByText("broken clouds")).toBeInTheDocument();
  });

  describe.each([
    ["Vietnamese", "vi", "mây cụm"],
    ["French", "fr", "nuageux"],
  ] as const)("when the UI language is %s", (language, lang, description) => {
    beforeEach(() => useTranslationStore.setState({ language }));
    afterEach(() => useTranslationStore.setState({ language: "English (US)" }));

    it(`shows the ${lang} description instead of English`, async () => {
      server.use(
        http.get("*/api/weather/forecast", ({ request }) => {
          const requested = new URL(request.url).searchParams.get("lang");
          const weather =
            requested === lang
              ? { main: "Clouds", description, icon: "04d" }
              : forecastBody.list[0].weather[0];
          return HttpResponse.json({
            ...forecastBody,
            list: [{ ...forecastBody.list[0], weather: [weather] }],
          });
        }),
      );

      renderWithProviders(
        <TripDetailWeatherPanel
          destination="Da Nang"
          activeDayDate="2026-11-14T00:00:00.000Z"
        />,
      );

      expect(await screen.findByText(description)).toBeInTheDocument();
      expect(screen.queryByText("broken clouds")).not.toBeInTheDocument();
    });
  });

  it("shows the not-configured alert when the server has no weather key", async () => {
    server.use(
      http.get("*/api/weather/forecast", () =>
        HttpResponse.json(
          { code: "WEATHER_NOT_CONFIGURED", message: "not configured" },
          { status: 503 },
        ),
      ),
    );

    renderWithProviders(
      <TripDetailWeatherPanel
        destination="Da Nang"
        activeDayDate="2026-11-14T00:00:00.000Z"
      />,
    );

    expect(await screen.findByText("Weather unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load weather")).not.toBeInTheDocument();
  });
});
