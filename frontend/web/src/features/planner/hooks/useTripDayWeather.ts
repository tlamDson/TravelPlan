import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import {
  getTripDayWeatherForecast,
  isWeatherNotConfiguredError,
} from "@/features/planner/api/weather.api";
import { useTranslationStore } from "@/stores/useTranslationStore";

interface UseTripDayWeatherParams {
  destination?: string;
  dayDateIso?: string;
}

export function useTripDayWeather({
  destination,
  dayDateIso,
}: UseTripDayWeatherParams) {
  const { isLoaded, isSignedIn } = useAuth();
  const language = useTranslationStore((state) => state.language);

  return useQuery({
    queryKey: ["trip-day-weather", destination, dayDateIso, language],
    queryFn: () =>
      getTripDayWeatherForecast({
        destination: destination!,
        dayDateIso: dayDateIso!,
        language,
      }),
    enabled: Boolean(
      destination &&
        dayDateIso &&
        isLoaded &&
        isSignedIn,
    ),
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    // A missing server key won't fix itself on retry.
    retry: (failureCount, error) =>
      !isWeatherNotConfiguredError(error) && failureCount < 1,
  });
}
