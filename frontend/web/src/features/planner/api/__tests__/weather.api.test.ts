import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import * as appEnv from "@/config/env";
import { getTripDayWeatherForecast } from "../weather.api";

const forecastBody = {
  city: { timezone: 0 },
  list: [
    {
      dt: Date.UTC(2026, 10, 14, 12) / 1000,
      dt_txt: "2026-11-14 12:00:00",
      main: { temp_min: 21.4, temp_max: 28.6 },
      weather: [{ main: "Clouds", description: "broken clouds", icon: "04d" }],
      pop: 0.35,
    },
  ],
};

describe("getTripDayWeatherForecast", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("asks the TravelPlan backend proxy and never sends an appid", async () => {
    const seen: URL[] = [];
    let directCalls = 0;
    server.use(
      http.get("*/api/weather/forecast", ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json(forecastBody);
      }),
      http.get("https://api.openweathermap.org/*", () => {
        directCalls += 1;
        return HttpResponse.json(forecastBody);
      }),
    );

    const result = await getTripDayWeatherForecast({
      destination: "Da Nang",
      dayDateIso: "2026-11-14T00:00:00.000Z",
    });

    expect(directCalls).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].searchParams.get("q")).toBe("Da Nang");
    expect(seen[0].searchParams.has("appid")).toBe(false);
    expect(result).toEqual({
      dayKey: "2026-11-14",
      expectedHighC: 29,
      expectedLowC: 21,
      condition: "Clouds",
      description: "broken clouds",
      icon: "04d",
      precipitationChance: 35,
    });
  });

  it.each([
    ["Vietnamese", "vi"],
    ["French", "fr"],
    ["English (US)", "en"],
  ] as const)(
    "requests %s descriptions with lang=%s",
    async (language, expectedLang) => {
      const seen: URL[] = [];
      server.use(
        http.get("*/api/weather/forecast", ({ request }) => {
          seen.push(new URL(request.url));
          return HttpResponse.json(forecastBody);
        }),
      );

      await getTripDayWeatherForecast({
        destination: "Da Nang",
        dayDateIso: "2026-11-14T00:00:00.000Z",
        language,
      });

      expect(seen).toHaveLength(1);
      expect(seen[0].searchParams.get("lang")).toBe(expectedLang);
    },
  );

  it("does not ship an OpenWeather key in the frontend config", () => {
    expect(Object.keys(appEnv)).not.toContain("OPENWEATHER_API_KEY");
    expect(Object.keys(appEnv)).not.toContain("OPENWEATHER_BASE_URL");
  });
});
