import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";

// The browser pino logger (asObject) hands console.warn a raw object, which
// devtools prints as "[object Object]". Record what the code asks of it.
const logger = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ createBrowserLogger: () => logger }));

import { getTripDayWeatherForecast } from "../weather.api";

const entry = {
  dt: Date.UTC(2026, 10, 14, 12) / 1000,
  dt_txt: "2026-11-14 12:00:00",
  main: { temp_min: 21.4, temp_max: 28.6 },
  weather: [{ main: "Clouds", description: "broken clouds", icon: "04d" }],
  pop: 0.35,
};

describe("getTripDayWeatherForecast logging", () => {
  beforeEach(() => {
    for (const fn of Object.values(logger)) fn.mockReset();
  });

  it("does not warn when it falls back to the nearest forecast day", async () => {
    server.use(
      http.get("*/api/weather/forecast", () =>
        HttpResponse.json({ city: { timezone: 0 }, list: [entry] }),
      ),
    );

    const result = await getTripDayWeatherForecast({
      destination: "Da Nang",
      dayDateIso: "2026-11-20T00:00:00.000Z",
    });

    expect(result).not.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
    const fallback = logger.debug.mock.calls.find(([msg]) =>
      String(msg).includes("nearest available forecast day"),
    );
    expect(fallback).toBeDefined();
    expect(typeof fallback?.[0]).toBe("string");
    expect(fallback).toHaveLength(1);
  });

  it("does not warn when the forecast has no entries", async () => {
    server.use(
      http.get("*/api/weather/forecast", () =>
        HttpResponse.json({ city: { timezone: 0 }, list: [] }),
      ),
    );

    const result = await getTripDayWeatherForecast({
      destination: "Da Nang",
      dayDateIso: "2026-11-14T00:00:00.000Z",
    });

    expect(result).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
    const empty = logger.debug.mock.calls.find(([msg]) =>
      String(msg).includes("No forecast entries"),
    );
    expect(empty).toBeDefined();
    expect(typeof empty?.[0]).toBe("string");
    expect(empty).toHaveLength(1);
  });
});
