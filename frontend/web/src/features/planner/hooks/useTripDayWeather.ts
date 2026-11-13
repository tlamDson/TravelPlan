import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import {
  getTripDayWeatherForecast,
  isWeatherNotConfiguredError,
} from "@/features/planner/api/weather.api";

interface UseTripDayWeatherParams {
  destination?: string;
  dayDateIso?: string;
}

export function useTripDayWeather({
  destination,
  dayDateIso,
}: UseTripDayWeatherParams) {
  const { isLoaded, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["trip-day-weather", destination, dayDateIso],
    queryFn: () =>
      getTripDayWeatherForecast({
        destination: destination!,
        dayDateIso: dayDateIso!,
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
