import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../../../config/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../config/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      OPENWEATHER_API_KEY: "server-side-key",
      OPENWEATHER_BASE_URL: "",
    },
  };
});

import axios from "axios";
import {
  fetchOpenWeatherForecastJson,
  clearOpenWeatherForecastCache,
  OpenWeatherProxyError,
} from "./openweather-proxy.service";

const forecastBody = { list: [], city: { timezone: 25200 } };

describe("fetchOpenWeatherForecastJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearOpenWeatherForecastCache();
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the server-side key to OpenWeather", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

    await expect(fetchOpenWeatherForecastJson("Da Nang")).resolves.toEqual(
      forecastBody,
    );
    expect(axios.get).toHaveBeenCalledWith(
      "https://api.openweathermap.org/data/2.5/forecast",
      expect.objectContaining({
        params: {
          q: "Da Nang",
          units: "metric",
          appid: "server-side-key",
          lang: "en",
        },
      }),
    );
  });

  it.each(["vi", "fr"])(
    "asks OpenWeather for %s descriptions when that language is requested",
    async (lang) => {
      vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

      await fetchOpenWeatherForecastJson("Da Nang", lang);

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ lang }),
        }),
      );
    },
  );

  it("falls back to English for a language it does not support", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

    await fetchOpenWeatherForecastJson("Da Nang", "xx&appid=evil");

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ lang: "en" }),
      }),
    );
  });

  it("caches each language separately for the same city", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

    await fetchOpenWeatherForecastJson("Da Nang", "vi");
    await fetchOpenWeatherForecastJson("Da Nang", "en");
    await fetchOpenWeatherForecastJson("Da Nang", "vi");

    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it("serves repeat lookups for the same city from cache", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

    await fetchOpenWeatherForecastJson("Da Nang");
    await fetchOpenWeatherForecastJson("  da nang ");

    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cache entry has expired", async () => {
    vi.mocked(axios.get).mockResolvedValue({ status: 200, data: forecastBody });

    await fetchOpenWeatherForecastJson("Da Nang");
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    await fetchOpenWeatherForecastJson("Da Nang");

    expect(axios.get).toHaveBeenCalledTimes(2);
  });

  it("does not cache upstream failures", async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ status: 500, data: { message: "boom" } })
      .mockResolvedValueOnce({ status: 200, data: forecastBody });

    await expect(
      fetchOpenWeatherForecastJson("Da Nang"),
    ).rejects.toBeInstanceOf(OpenWeatherProxyError);
    await expect(fetchOpenWeatherForecastJson("Da Nang")).resolves.toEqual(
      forecastBody,
    );
    expect(axios.get).toHaveBeenCalledTimes(2);
  });
});
