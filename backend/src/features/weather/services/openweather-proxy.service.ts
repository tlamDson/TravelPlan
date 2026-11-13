/**
 * Server-side OpenWeather 2.5 forecast proxy (keeps API key off the client).
 */

import axios from "axios";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";

function openWeatherBaseUrl(): string {
  const fromEnv = env.OPENWEATHER_BASE_URL?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "https://api.openweathermap.org/data/2.5";
}

function normalizedKey(): string | undefined {
  const raw = env.OPENWEATHER_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return raw && raw.length > 0 ? raw : undefined;
}

export function isOpenWeatherConfigured(): boolean {
  return Boolean(normalizedKey());
}

/** OpenWeather's 3-hourly forecast changes slowly; one upstream call per city per window. */
const FORECAST_CACHE_TTL_MS = 10 * 60 * 1000;
const FORECAST_CACHE_MAX_ENTRIES = 500;
const forecastCache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Test hook: drop all cached forecasts. */
export function clearOpenWeatherForecastCache(): void {
  forecastCache.clear();
}

export class OpenWeatherProxyError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "OpenWeatherProxyError";
  }
}

/**
 * Returns raw JSON body from OpenWeather /forecast (same shape as direct API).
 */
export async function fetchOpenWeatherForecastJson(q: string): Promise<unknown> {
  const appid = normalizedKey();
  if (!appid) {
    throw new OpenWeatherProxyError("OPENWEATHER_NOT_CONFIGURED", 503);
  }

  const key = cacheKey(q);
  const cached = forecastCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  forecastCache.delete(key);

  const url = `${openWeatherBaseUrl()}/forecast`;
  const response = await axios.get(url, {
    params: { q, units: "metric", appid },
    validateStatus: () => true,
    timeout: 20_000,
  });

  const data = response.data;
  if (response.status === 200) {
    if (forecastCache.size >= FORECAST_CACHE_MAX_ENTRIES) {
      const oldest = forecastCache.keys().next().value;
      if (oldest !== undefined) forecastCache.delete(oldest);
    }
    forecastCache.set(key, {
      data,
      expiresAt: Date.now() + FORECAST_CACHE_TTL_MS,
    });
    return data;
  }

  const providerMessage =
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
      ? (data as { message: string }).message
      : undefined;

  logger.warn(
    {
      status: response.status,
      q,
      providerMessage,
      appidLength: appid.length,
    },
    "OpenWeather forecast request failed (proxy)",
  );

  if (response.status === 401) {
    throw new OpenWeatherProxyError(
      "OPENWEATHER_UNAUTHORIZED",
      401,
      providerMessage,
    );
  }

  throw new OpenWeatherProxyError(
    "OPENWEATHER_UPSTREAM_ERROR",
    response.status >= 400 && response.status < 600 ? response.status : 502,
    providerMessage,
  );
}
