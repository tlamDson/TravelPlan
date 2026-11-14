/**
 * ItineraryDayCard
 *
 * Displays one day of a trip itinerary as a timeline of activity cards.
 * Each activity shows: photo hero (if available), type icon, time slot,
 * name, star rating, opening hours, cost, status badge.
 */

import {
  Building2,
  MapPin,
  Train,
  Pencil,
  Clock,
  DollarSign,
  Star,
  ExternalLink,
  Car,
  ChevronDown,
  Utensils,
  Coffee,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ItineraryDay, Activity } from "@/utils/schemas";
import { getGoogleMapsUrl } from "../utils/maps";
import { formatOpeningHours } from "../utils/opening-hours";
import {
  formatDate,
  convertCurrency,
  formatPriceLevel,
  formatPriceCategory,
} from "@/utils/format";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableActivityRow } from "./SortableActivityRow";

// ─── Types ────────────────────────────────────────────────

interface ItineraryDayCardProps {
  day: ItineraryDay;
  dayIndex: number;
  currency?: string;
  isDragDisabled?: boolean;
  regenningActivityId?: string | null;
  onRegenActivity?: (
    dayIndex: number,
    activityId: string,
    hint?: string,
  ) => void;
}

// ─── Activity type metadata ────────────────────────────────

const TYPE_META: Record<
  Activity["type"],
  { icon: React.ElementType; labelKey: string; color: string; bg: string }
> = {
  accommodation: {
    icon: Building2,
    labelKey: "trip.type.accommodation",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-950",
  },
  poi: {
    icon: MapPin,
    labelKey: "trip.type.poi",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  transport: {
    icon: Train,
    labelKey: "trip.type.transport",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-950",
  },
  custom: {
    icon: Pencil,
    labelKey: "trip.type.custom",
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
};

// ─── Meal codes ───────────────────────────────────────────

/** The itinerary builder writes the meal slot code ("Lunch") into `notes`. */
const MEAL_CODES = ["breakfast", "lunch", "dinner"] as const;

function mealLabelKey(notes?: string): string | null {
  const code = notes?.trim().toLowerCase();
  return MEAL_CODES.find((m) => m === code) ? `trip.meal.${code}` : null;
}

// ─── Status badge variant ──────────────────────────────────

const STATUS_VARIANT: Record<
  Activity["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  planned: "outline",
  confirmed: "default",
  completed: "secondary",
  cancelled: "destructive",
};

// ─── Time helpers ─────────────────────────────────────────

/** Default activity duration in minutes when no endTime + no next activity */
const DEFAULT_DURATION: Record<Activity["type"], number> = {
  poi: 180, // 3 hours
  accommodation: 60,
  transport: 90,
  custom: 120,
};

/** Add minutes to an "HH:MM" string → "HH:MM" */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Derive the end time for an activity.
 * Priority: activity.endTime > nextActivity.time > type default.
 */
function deriveEndTime(
  activity: Activity,
  nextTime?: string,
): string | undefined {
  if (activity.endTime) return activity.endTime;
  if (!activity.time) return undefined;
  if (nextTime) return nextTime;
  return addMinutes(activity.time, DEFAULT_DURATION[activity.type] ?? 120);
}

// ─── Time formatter ────────────────────────────────────────

function formatTimeRange(time?: string, endTime?: string): string {
  if (!time) return "";
  const fmt = (t: string) => {
    const [h, m] = t.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${m} ${ampm}`;
  };
  return endTime ? `${fmt(time)} – ${fmt(endTime)}` : fmt(time);
}

// ─── Star rating component ─────────────────────────────────

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Rating: ${value} out of 5`}
    >
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className="h-3 w-3 fill-amber-400 text-amber-400" />
      ))}
      {half && (
        <span className="relative inline-flex h-3 w-3">
          <Star className="absolute inset-0 h-3 w-3 text-muted-foreground/30" />
          <span className="absolute inset-0 overflow-hidden w-[50%]">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          </span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className="h-3 w-3 text-muted-foreground/30" />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {value.toFixed(1)}
      </span>
    </span>
  );
}

// ─── Sub-component: single activity row ───────────────────

function ActivityRow({
  activity,
  derivedEndTime,
  currency = "USD",
  isFirst,
  isLast,
  distanceUnit = "Km",
  preferredCurrency = "USD",
  language,
}: {
  activity: Activity;
  derivedEndTime?: string;
  currency?: string;
  isFirst: boolean;
  isLast: boolean;
  distanceUnit?: "Miles" | "Km";
  preferredCurrency?: string;
  language?: Language;
}) {
  const { t } = useTranslationStore();
  const meta = TYPE_META[activity.type] ?? TYPE_META.custom;
  const Icon = meta.icon;
  const timeLabel = formatTimeRange(activity.time, derivedEndTime);
  const mealKey = mealLabelKey(activity.notes);
  const openingHoursText = formatOpeningHours(activity, t);

  // Format distance based on user preference
  const formatDistance = (km: number) => {
    if (distanceUnit === "Miles") {
      return (km * 0.621371).toFixed(1) + " mi";
    }
    return km.toFixed(1) + " km";
  };

  const distPrev = activity.distanceFromPrevious;
  const showDistance = !isFirst && distPrev !== undefined && distPrev > 0;
  const showStatusBadge = activity.status !== "planned";

  // Detect if this is a meal based on name/notes presence of keywords
  const isMeal = (() => {
    // If it's already an accommodation or transport, it's not a meal
    if (activity.type !== "poi" && activity.type !== "custom") return false;

    const text = `${activity.name} ${activity.notes || ""}`.toLowerCase();
    const mealKeywords = [
      "breakfast",
      "lunch",
      "dinner",
      "restaurant",
      "cafe",
      "café",
      "eatery",
      "dining",
      "street food",
      "bakery",
      "brunch",
      "supper",
    ];
    return mealKeywords.some((kw) => text.includes(kw));
  })();

  // Apply vibrant dining styling inspired by ui-ux-pro-max
  const iconBg = isMeal ? "bg-red-100 dark:bg-red-950/40" : meta.bg;
  const iconColor = isMeal ? "text-red-600 dark:text-red-400" : meta.color;
  const MealIcon = isMeal ? Coffee : Icon;
  const cardBorder = isMeal
    ? "border-red-200/60 hover:border-red-400 dark:border-red-900/30 dark:hover:border-red-500/50"
    : "border-border hover:border-primary/50";
  const cardBg = isMeal ? "bg-red-50/20 dark:bg-red-950/10" : "bg-card";

  return (
    <div className="relative flex gap-3 pb-4">
      {/* Distance from previous indicator (placed on the timeline above the icon) */}
      {showDistance && (
        <div className="absolute -top-3 left-[0.1rem] flex items-center z-20">
          <div className="bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border rounded-full shadow-sm flex items-center gap-0.5">
            <MapPin className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden />
            {formatDistance(distPrev ?? 0)}
          </div>
        </div>
      )}

      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-[1.1rem] top-9 bottom-0 w-px bg-border" />
      )}

      {/* Icon circle */}
      <div
        className={`shrink-0 mt-1 h-9 w-9 rounded-full flex items-center justify-center z-10 transition-colors ${iconBg}`}
      >
        <MealIcon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
      </div>

      {/* Card body */}
      <div
        className={`flex-1 min-w-0 flex flex-col sm:flex-row rounded-lg border shadow-sm overflow-hidden group transition-all duration-200 sm:min-h-[140px] motion-reduce:transition-none hover:shadow-md ${cardBorder} ${cardBg}`}
      >
        {/* Photo hero */}
        {activity.photoUrl && (
          <div className="w-full h-40 sm:h-36 sm:w-44 sm:min-h-[7rem] overflow-hidden shrink-0 border-r border-border/10">
            <img
              src={activity.photoUrl}
              alt={activity.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        <div className="p-4 pr-12 sm:pr-14 flex-1 flex flex-col">
          {/* Top row: time + status */}
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            {timeLabel ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {timeLabel}
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2 items-center flex-wrap justify-end">
              {isMeal && (
                <Badge
                  variant="secondary"
                  className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 border-none text-xs capitalize h-5 gap-1 shadow-sm"
                >
                  <Utensils className="h-3 w-3" />
                  {t("trip.diningTag")}
                </Badge>
              )}
              {showStatusBadge ? (
                <Badge
                  variant={STATUS_VARIANT[activity.status]}
                  className="text-xs capitalize h-5"
                >
                  {t(`trip.status.${activity.status}`)}
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Activity name */}
          <p
            className={`font-medium text-base sm:text-lg leading-snug line-clamp-2 transition-colors ${isMeal ? "group-hover:text-red-600 dark:group-hover:text-red-400" : "group-hover:text-primary"}`}
          >
            {activity.name}
          </p>

          <a
            href={getGoogleMapsUrl(activity)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:text-primary/80 transition-colors focus:outline-none focus:underline"
            aria-label={`View ${activity.name} on Google Maps`}
          >
            <MapPin className="h-3 w-3" aria-hidden="true" />
            <span className="truncate hover:underline">
              {t("map.viewOnMap")}
            </span>
            <ExternalLink className="h-3 w-3 ml-0.5" aria-hidden="true" />
          </a>

          {/* Rating */}
          {activity.rating !== undefined && activity.rating > 0 && (
            <div className="mt-1.5 border-t pt-1.5 border-border/40">
              <StarRating value={activity.rating} />
            </div>
          )}

          {/* Opening hours */}
          {openingHoursText && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{openingHoursText}</span>
            </div>
          )}

          {/* Price Level from Google Maps - UI UX Pro Max Design */}
          {activity.priceLevel !== undefined && activity.priceLevel > 0 && (
            <div
              className="flex items-center gap-1.5 mt-1.5 text-xs font-medium bg-emerald-50/50 dark:bg-emerald-950/20 w-fit px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              aria-label={`Price level: ${activity.priceLevel} out of 4`}
            >
              <span>
                {formatPriceLevel(
                  activity.priceLevel,
                  preferredCurrency,
                  language,
                )}
              </span>
              <span className="w-1 h-1 rounded-full bg-emerald-600/30 dark:bg-emerald-400/30" />
              <span>{formatPriceCategory(activity.priceLevel, language)}</span>
            </div>
          )}

          {/* Transport warning — shown when gap to next activity exceeds threshold */}
          {activity.requiresTransport && (
            <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-md text-xs text-amber-700 dark:text-amber-400">
              <Car className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("trip.transportWarning")}</span>
            </div>
          )}

          {/* Nearby food suggestions */}
          {(activity.nearbySuggestions?.length ?? 0) > 0 && (
            <details className="mt-2 group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors list-none">
                <Utensils className="h-3 w-3 shrink-0" aria-hidden="true" />
                {t("trip.nearbySuggestionsSummary").replace(
                  "{count}",
                  String(activity.nearbySuggestions?.length ?? 0),
                )}
                <ChevronDown
                  className="h-3 w-3 ml-auto transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-2 space-y-1.5 pl-1">
                {activity.nearbySuggestions?.map((s) => (
                  <div
                    key={s.placeId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      {s.photoUrl ? (
                        <img
                          src={s.photoUrl}
                          alt={s.name}
                          className="h-5 w-5 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded bg-muted shrink-0" />
                      )}
                      <span className="truncate font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                      <span>
                        {s.distanceKm < 1
                          ? `${Math.round(s.distanceKm * 1000)}m`
                          : `${s.distanceKm}km`}
                      </span>
                      {s.priceLevel !== undefined && (
                        <span>{"$".repeat(s.priceLevel + 1)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Bottom row: type label + cost */}
          <div className="mt-auto">
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 flex-wrap gap-1">
              <span className={`text-xs font-medium ${meta.color}`}>
                {t(meta.labelKey)}
              </span>
              {activity.cost != null && activity.cost > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3" aria-hidden="true" />
                  {convertCurrency(
                    activity.cost,
                    currency || "USD",
                    preferredCurrency,
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: preferredCurrency === "VND" ? 0 : 2,
                  })}{" "}
                  {preferredCurrency}
                </span>
              )}
            </div>

            {/* Notes */}
            {activity.notes && (
              <p className="mt-2 pt-2 border-t border-border/40 text-xs text-muted-foreground italic line-clamp-2">
                {mealKey ? t(mealKey) : activity.notes}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

export function ItineraryDayCard({
  day,
  dayIndex,
  currency,
  isDragDisabled = false,
  regenningActivityId = null,
  onRegenActivity,
}: ItineraryDayCardProps) {
  const {
    t,
    language,
    distanceUnit,
    currency: preferredCurrency,
  } = useTranslationStore();
  const dayLabel = t("trip.dayLabel").replace("{n}", String(day.day));

  const dateLabel = (() => {
    try {
      // Parse only the calendar date (YYYY-MM-DD) to avoid UTC→local timezone
      // shifting: "2026-02-19T00:00:00.000Z" → Feb 18 in UTC-5 without this fix.
      const dateOnly = day.date.slice(0, 10); // "YYYY-MM-DD"
      const [year, month, dayOfMonth] = dateOnly.split("-").map(Number);
      const localDate = new Date(year!, month! - 1, dayOfMonth!);
      return formatDate(localDate, language, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dayLabel;
    }
  })();

  return (
    <div
      className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-shadow duration-200 hover:shadow-md"
      data-testid={`itinerary-day-${dayIndex}`}
    >
      {/* Day header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {dayLabel}
          </span>
          <p
            className="font-semibold text-sm text-foreground"
            data-testid="itinerary-day-title"
          >
            {dateLabel}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {t(
            day.activities.length === 1
              ? "trip.activityCountOne"
              : "trip.activityCountOther",
          ).replace("{count}", String(day.activities.length))}
        </Badge>
      </div>

      {/* Activities timeline */}
      <div className="px-4 pt-4">
        {day.activities.length === 0 ? (
          <p className="text-sm text-muted-foreground pb-4">
            {t("trip.noActivitiesForDay")}
          </p>
        ) : (
          (() => {
            // Important: DnD uses `order` as the source of truth.
            // Sorting by time would snap cards back to their old position.
            const sorted = day.activities.slice().sort((a, b) => {
              if (a.order !== b.order) return a.order - b.order;
              if (a.time && b.time) return a.time.localeCompare(b.time);
              return 0;
            });
            // Only include activities that have an _id (Mongo subdocuments always do)
            const sortableIds = sorted
              .filter((a) => !!a._id)
              .map((a) => a._id!);
            return (
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {sorted.map((activity, idx) => (
                  <SortableActivityRow
                    key={activity._id ?? idx}
                    activity={activity}
                    isDragDisabled={isDragDisabled}
                    isRegenning={regenningActivityId === activity._id}
                    onRegen={(activityId, hint) =>
                      onRegenActivity?.(dayIndex, activityId, hint)
                    }
                  >
                    <ActivityRow
                      activity={activity}
                      currency={currency}
                      derivedEndTime={deriveEndTime(
                        activity,
                        sorted[idx + 1]?.time,
                      )}
                      isFirst={idx === 0}
                      isLast={idx === sorted.length - 1}
                      distanceUnit={distanceUnit}
                      preferredCurrency={preferredCurrency}
                      language={language}
                    />
                  </SortableActivityRow>
                ))}
              </SortableContext>
            );
          })()
        )}
      </div>
    </div>
  );
}
