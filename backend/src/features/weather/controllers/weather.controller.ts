/**
 * GET /api/weather/forecast — authenticated proxy to OpenWeather 2.5 forecast.
 */

import { Response } from "express";
import { ClerkRequest } from "../../../types/express";
import {
  fetchOpenWeatherForecastJson,
  OpenWeatherProxyError,
  isOpenWeatherConfigured,
} from "../services/openweather-proxy.service";

export async function getWeatherForecast(
  req: ClerkRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = req.auth?.()?.userId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const q = req.query.q;
    if (typeof q !== "string" || !q.trim()) {
      res.status(400).json({ message: "Query parameter q is required" });
      return;
    }

    if (!isOpenWeatherConfigured()) {
      res.status(503).json({
        code: "WEATHER_NOT_CONFIGURED",
        message:
          "Weather is not configured on the server. Set OPENWEATHER_API_KEY in .env.docker (Docker) or backend/.env (local API).",
      });
      return;
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : undefined;
    const data = await fetchOpenWeatherForecastJson(q.trim(), lang);
    res.json(data);
  } catch (err: unknown) {
    if (err instanceof OpenWeatherProxyError) {
      if (err.message === "OPENWEATHER_UNAUTHORIZED") {
        res.status(502).json({
          code: "OPENWEATHER_UNAUTHORIZED",
          message:
            err.providerMessage ??
            "OpenWeather rejected the server API key. Set OPENWEATHER_API_KEY in .env.docker (Docker) or backend/.env (32-char key from openweathermap.org), then recreate/restart the API.",
        });
        return;
      }
      if (
        err.message === "OPENWEATHER_NOT_CONFIGURED" ||
        err.message === "OPENWEATHER_UPSTREAM_ERROR"
      ) {
        res.status(502).json({
          code: "OPENWEATHER_ERROR",
          message:
            err.providerMessage ?? "Weather data temporarily unavailable",
        });
        return;
      }
    }
    res.status(502).json({
      code: "WEATHER_ERROR",
      message: "Failed to load weather forecast",
    });
  }
}
