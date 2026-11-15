import { useMemo } from "react";
import { CalendarDays, Map, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { convertCurrency } from "@/utils/format";
import { localizeDestination } from "@/utils/country-name";
import { TripDetailWeatherPanel } from "@/features/planner/components/trip-detail/TripDetailWeatherPanel";
import { MAPBOX_TOKEN } from "@/config/env";

interface TripDetailSummaryRailProps {
  tripId: string;
  destination?: string;
  activeDayDate?: string;
  activeDayCoordinates: Array<[number, number]>;
  allTripCoordinates: Array<[number, number]>;
  dateRange: string;
  totalCalendarDays: number;
  totalStops: number;
  budgetTotal?: number;
  budgetCurrency?: string;
  preferredCurrency: string;
  showViewOnMap: boolean;
  onViewMap: () => void;
}

export function TripDetailSummaryRail({
  tripId,
  destination,
  activeDayDate,
  activeDayCoordinates,
  allTripCoordinates,
  dateRange,
  totalCalendarDays,
  totalStops,
  budgetTotal,
  budgetCurrency,
  preferredCurrency,
  showViewOnMap,
  onViewMap,
}: TripDetailSummaryRailProps) {
  const { t, language } = useTranslationStore();
  const previewCoordinates =
    activeDayCoordinates.length > 0 ? activeDayCoordinates : allTripCoordinates;

  const staticMapUrl = useMemo(() => {
    if (!MAPBOX_TOKEN || previewCoordinates.length === 0) return null;
    const [lng, lat] = previewCoordinates.reduce(
      ([sumLng, sumLat], [pointLng, pointLat]) => [
        sumLng + pointLng,
        sumLat + pointLat,
      ],
      [0, 0],
    );
    const centerLng = lng / previewCoordinates.length;
    const centerLat = lat / previewCoordinates.length;
    const marker = previewCoordinates[0];

    return [
      "https://api.mapbox.com/styles/v1/mapbox/dark-v11/static",
      `/pin-s+38BDF8(${marker[0]},${marker[1]})/`,
      `${centerLng},${centerLat},10/640x280`,
      `?access_token=${MAPBOX_TOKEN}`,
    ].join("");
  }, [previewCoordinates]);

  const displayBudget =
    budgetTotal != null &&
    budgetTotal > 0 &&
    budgetCurrency &&
    (() => {
      try {
        const converted = convertCurrency(
          budgetTotal,
          budgetCurrency,
          preferredCurrency,
        );
        return `${converted.toLocaleString(undefined, {
          maximumFractionDigits: preferredCurrency === "VND" ? 0 : 2,
        })} ${preferredCurrency}`;
      } catch {
        return `${budgetTotal} ${budgetCurrency}`;
      }
    })();

  return (
    <aside className="lg:sticky lg:top-4 space-y-4">
      <div className="rounded-xl border bg-card/50 backdrop-blur-sm shadow-sm p-5 space-y-4 transition-shadow duration-200 hover:shadow-md">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("trip.summary")}
          </h2>
          {destination ? (
            <p className="mt-1 flex items-start gap-2 text-sm font-medium text-foreground">
              <MapPin
                className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"
                aria-hidden
              />
              <span className="leading-snug">
                {localizeDestination(destination, language)}
              </span>
            </p>
          ) : null}
        </div>

        {dateRange ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p>{dateRange}</p>
              {totalCalendarDays > 0 ? (
                <p className="mt-0.5 text-xs">
                  {totalCalendarDays}{" "}
                  {totalCalendarDays === 1
                    ? t("trip.summaryDaySingular")
                    : t("trip.summaryDayPlural")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <p className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
            {t("trip.totalStops")}
          </p>
          <p className="text-lg font-semibold tabular-nums">{totalStops}</p>
        </div>

        {displayBudget ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
              {t("trip.budgetLabel")}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {displayBudget}
            </p>
          </div>
        ) : null}

        {showViewOnMap ? (
          <Button
            type="button"
            variant="default"
            className="w-full min-h-10 cursor-pointer transition-colors duration-200 gap-2"
            onClick={onViewMap}
          >
            <Map className="h-4 w-4 shrink-0" aria-hidden />
            {t("map.viewOnMap")}
          </Button>
        ) : null}
      </div>

      <TripDetailWeatherPanel
        destination={destination}
        activeDayDate={activeDayDate}
      />

      <div className="rounded-xl border bg-card/50 backdrop-blur-sm shadow-sm p-3 space-y-3 transition-shadow duration-200 hover:shadow-md">
        <div className="px-2 pt-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t("trip.minimapTitle")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t("trip.minimapSubtitle")}
          </p>
        </div>

        {staticMapUrl ? (
          <button
            type="button"
            onClick={onViewMap}
            className="group block w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={t("trip.openMapFullscreen")}
          >
            <img
              src={staticMapUrl}
              alt={`${t("trip.minimapTitle")} - ${destination || "trip"}`}
              className="h-36 w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
              loading="lazy"
            />
          </button>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
            {t("trip.minimapEmpty")}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full min-h-10 cursor-pointer transition-colors duration-200 gap-2"
          onClick={onViewMap}
          disabled={!showViewOnMap || !tripId}
        >
          <Map className="h-4 w-4 shrink-0" aria-hidden />
          {t("trip.openMapFullscreen")}
        </Button>
      </div>
    </aside>
  );
}
