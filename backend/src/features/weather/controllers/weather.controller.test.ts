import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchForecast = vi.fn();
vi.mock("../services/openweather-proxy.service", () => ({
  fetchOpenWeatherForecastJson: (...args: unknown[]) =>
    mockFetchForecast(...args),
  isOpenWeatherConfigured: () => true,
  OpenWeatherProxyError: class OpenWeatherProxyError extends Error {},
}));

import { getWeatherForecast } from "./weather.controller";
import type { Response } from "express";
import type { ClerkRequest } from "../../../types/express";

function makeReq(query: Record<string, unknown>): ClerkRequest {
  return { auth: () => ({ userId: "user-1" }), query } as unknown as ClerkRequest;
}

function makeRes() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("getWeatherForecast", () => {
  beforeEach(() => {
    mockFetchForecast.mockReset();
    mockFetchForecast.mockResolvedValue({ list: [] });
  });

  it("passes the requested lang through to the proxy service", async () => {
    const res = makeRes();

    await getWeatherForecast(makeReq({ q: " Da Nang ", lang: "vi" }), res);

    expect(mockFetchForecast).toHaveBeenCalledWith("Da Nang", "vi");
    expect(res.json).toHaveBeenCalledWith({ list: [] });
  });

  it("passes no lang when the client sends none", async () => {
    await getWeatherForecast(makeReq({ q: "Da Nang" }), makeRes());

    expect(mockFetchForecast).toHaveBeenCalledWith("Da Nang", undefined);
  });
});
