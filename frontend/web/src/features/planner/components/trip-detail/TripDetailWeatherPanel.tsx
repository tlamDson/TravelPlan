import { AlertCircle, CloudSun, Droplets } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useTripDayWeather } from "@/features/planner/hooks";
import { isWeatherNotConfiguredError } from "@/features/planner/api/weather.api";
import { useTranslationStore } from "@/stores/useTranslationStore";

interface TripDetailWeatherPanelProps {
  destination?: string;
  activeDayDate?: string;
}

export function TripDetailWeatherPanel({
  destination,
  activeDayDate,
}: TripDetailWeatherPanelProps) {
  const { t } = useTranslationStore();
  const weatherQuery = useTripDayWeather({
    destination,
    dayDateIso: activeDayDate,
  });
  const weatherConfigReady = !isWeatherNotConfiguredError(weatherQuery.error);

  return (
    <div className="rounded-xl border bg-card/50 backdrop-blur-sm shadow-sm p-5 space-y-3 transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-center gap-2">
        <CloudSun className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">
          {t("trip.weatherTitle")}
        </h3>
      </div>

      {!weatherConfigReady ? (
        <Alert
          variant="destructive"
          className="border-destructive/50 bg-destructive/5 py-3"
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle className="text-sm">
            {t("trip.weatherMissingConfigTitle")}
          </AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>{t("trip.weatherMissingConfig")}</p>
            {import.meta.env.DEV ? (
              <p className="text-xs opacity-90">
                {t("trip.weatherMissingConfigDev")}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : weatherQuery.isLoading ? (
        <p className="text-sm text-muted-foreground animate-pulse motion-reduce:animate-none">
          {t("trip.weatherLoading")}
        </p>
      ) : weatherQuery.isError ? (
        <Alert
          variant="destructive"
          className="border-destructive/50 bg-destructive/5 py-3"
        >
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle className="text-sm">
            {t("trip.weatherLoadErrorTitle")}
          </AlertTitle>
          <AlertDescription className="text-sm">
            {t("trip.weatherLoadError")}
          </AlertDescription>
        </Alert>
      ) : weatherQuery.data ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            {t("trip.weatherExpectedForSelectedDay")}
          </p>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums leading-none">
                {weatherQuery.data.expectedHighC}C /{" "}
                {weatherQuery.data.expectedLowC}C
              </p>
              <p className="mt-1 text-sm text-foreground/80 capitalize">
                {weatherQuery.data.description}
              </p>
            </div>
            {weatherQuery.data.precipitationChance != null ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Droplets className="h-3.5 w-3.5 text-sky-500" aria-hidden />
                {weatherQuery.data.precipitationChance}%
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("trip.weatherUnavailable")}
        </p>
      )}
    </div>
  );
}
