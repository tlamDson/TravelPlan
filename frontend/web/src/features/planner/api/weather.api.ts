import { z } from "zod";
import { isAxiosError } from "axios";
import { apiClient } from "@/lib/axios";
import { validateAPI } from "@/utils/validation";
import { createBrowserLogger } from "@/lib/logger";
import type { Language } from "@/stores/useTranslationStore";

const weatherLogger = createBrowserLogger("weather-forecast");

const forecastItemSchema = z.object({
  dt: z.number(),
  dt_txt: z.string(),
  main: z.object({
    temp_min: z.number(),
    temp_max: z.number(),
  }),
  weather: z
    .array(
      z.object({
        main: z.string(),
        description: z.string(),
        icon: z.string(),
      }),
    )
    .min(1),
  pop: z.number().optional(),
});

const forecastResponseSchema = z.object({
  list: z.array(forecastItemSchema),
  city: z
    .object({
      timezone: z.number(),
    })
    .optional(),
});

export interface TripDayWeather {
  dayKey: string;
  expectedHighC: number;
  expectedLowC: number;
  condition: string;
  description: string;
  icon: string;
  precipitationChance: number | null;
}

interface GetTripDayWeatherParams {
  destination: string;
  dayDateIso: string;
  /** UI language; weather descriptions are requested in it. */
  language?: Language;
}

const WEATHER_LANG: Record<Language, string> = {
  "English (US)": "en",
  French: "fr",
  Vietnamese: "vi",
};

function toTimezoneDayKey(epochSeconds: number, timezoneOffsetSeconds: number): string {
  return new Date((epochSeconds + timezoneOffsetSeconds) * 1000)
    .toISOString()
    .slice(0, 10);
}

function selectRepresentativeEntry(
  entries: z.infer<typeof forecastItemSchema>[],
): z.infer<typeof forecastItemSchema> {
  return entries.reduce((best, current) => {
    const currentHour = Number(current.dt_txt.slice(11, 13));
    const bestHour = Number(best.dt_txt.slice(11, 13));
    return Math.abs(currentHour - 12) < Math.abs(bestHour - 12) ? current : best;
  });
}

/**
 * True when the backend answered that no OpenWeather key is configured on
 * the server (503 WEATHER_NOT_CONFIGURED) — a config gap, not a transient error.
 */
export function isWeatherNotConfiguredError(error: unknown): boolean {
  return (
    isAxiosError(error) &&
    error.response?.status === 503 &&
    (error.response.data as { code?: unknown } | undefined)?.code ===
      "WEATHER_NOT_CONFIGURED"
  );
}

/**
 * Forecast for one trip day, fetched through the backend proxy
 * (GET /api/weather/forecast) so the OpenWeather key never reaches the browser.
 */
export async function getTripDayWeatherForecast({
  destination,
  dayDateIso,
  language = "English (US)",
}: GetTripDayWeatherParams): Promise<TripDayWeather | null> {
  weatherLogger.info(
    { destination, dayDateIso },
    "Requesting weather forecast via backend proxy",
  );

  const response = await apiClient.get<unknown>("/weather/forecast", {
    params: { q: destination, lang: WEATHER_LANG[language] },
  });

  const rawData: unknown = response.data;
  const parsed = validateAPI(
    forecastResponseSchema,
    rawData,
    "getTripDayWeatherForecast",
  );

  const timezoneOffsetSeconds = parsed.city?.timezone ?? 0;
  const selectedEpochSeconds = Math.floor(new Date(dayDateIso).getTime() / 1000);
  const targetDayKey = toTimezoneDayKey(selectedEpochSeconds, timezoneOffsetSeconds);

  const groupedByDay = new Map<string, z.infer<typeof forecastItemSchema>[]>();
  for (const entry of parsed.list) {
    const dayKey = toTimezoneDayKey(entry.dt, timezoneOffsetSeconds);
    const existing = groupedByDay.get(dayKey);
    if (existing) {
      existing.push(entry);
    } else {
      groupedByDay.set(dayKey, [entry]);
    }
  }

  let dayEntries = groupedByDay.get(targetDayKey) ?? [];

  if (dayEntries.length === 0 && groupedByDay.size > 0) {
    const nearestDay = [...groupedByDay.keys()].sort((a, b) => {
      const diffA = Math.abs(
        new Date(`${a}T12:00:00.000Z`).getTime() - selectedEpochSeconds * 1000,
      );
      const diffB = Math.abs(
        new Date(`${b}T12:00:00.000Z`).getTime() - selectedEpochSeconds * 1000,
      );
      return diffA - diffB;
    })[0];

    dayEntries = nearestDay ? groupedByDay.get(nearestDay) ?? [] : [];

    weatherLogger.warn(
      {
        destination,
        requestedDay: targetDayKey,
        fallbackDay: nearestDay ?? null,
        availableDays: [...groupedByDay.keys()],
      },
      "Requested day missing in forecast; using nearest available forecast day",
    );
  }

  if (dayEntries.length === 0) {
    weatherLogger.warn(
      {
        destination,
        dayDateIso,
        requestedDay: targetDayKey,
      },
      "No forecast entries available for requested/nearest day",
    );
    return null;
  }

  const expectedHighC = Math.round(
    Math.max(...dayEntries.map((entry) => entry.main.temp_max)),
  );
  const expectedLowC = Math.round(
    Math.min(...dayEntries.map((entry) => entry.main.temp_min)),
  );
  const representative = selectRepresentativeEntry(dayEntries);
  const precipitationChance = dayEntries
    .map((entry) => entry.pop)
    .filter((value): value is number => value !== undefined)
    .reduce<number | null>((highest, value) => {
      const percent = Math.round(value * 100);
      if (highest === null) return percent;
      return Math.max(highest, percent);
    }, null);

  const result = {
    dayKey: targetDayKey,
    expectedHighC,
    expectedLowC,
    condition: representative.weather[0].main,
    description: representative.weather[0].description,
    icon: representative.weather[0].icon,
    precipitationChance,
  };

  weatherLogger.info(
    {
      destination,
      dayDateIso,
      result,
      dayEntriesCount: dayEntries.length,
      availableDays: [...groupedByDay.keys()],
    },
    "Weather forecast resolved",
  );

  return result;
}
