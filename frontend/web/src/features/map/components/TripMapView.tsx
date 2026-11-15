/**
 * TripMapView — Fullscreen Immersive Map
 *
 * Google Maps-style layout:
 * - Map fills full available height
 * - Floating collapsible left panel (day list)
 * - Bottom info card appears when a marker is selected (like Google Maps place card)
 * - Day legend bottom-right
 */

import { useState } from "react";
import { useMap } from "../hooks/useMap";
import { useTripMarkers } from "../hooks/useTripMarkers";
import type { SelectedActivity } from "../hooks/useTripMarkers";
import { getDayColor, getDayColorLight } from "../utils/dayColors";
import {
  useTranslationStore,
  type Language,
} from "@/stores/useTranslationStore";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Loader2,
  Clock,
  DollarSign,
  Filter,
} from "lucide-react";
import { WidgetError } from "@/components/WidgetError";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Trip, ItineraryDay, Activity } from "@/utils/schemas";
import { useReorderActivities } from "@/features/planner/hooks/useReorderActivities";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  convertCurrency,
  formatPriceLevel,
  getLocaleCode,
} from "@/utils/format";

// ── Helpers ──────────────────────────────────────────────────────

function hasCoordinates(itinerary: ItineraryDay[]): boolean {
  return itinerary.some((day) =>
    day.activities.some(
      (a) => a.location?.coordinates && a.location.coordinates.length === 2,
    ),
  );
}

function getInitialCenter(itinerary: ItineraryDay[]): [number, number] {
  for (const day of itinerary) {
    for (const act of day.activities) {
      if (act.location?.coordinates && act.location.coordinates.length === 2) {
        return act.location.coordinates as [number, number];
      }
    }
  }
  return [105.8342, 21.0278];
}

function getValidActivities(day: ItineraryDay): Activity[] {
  return day.activities
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter(
      (a) => a.location?.coordinates && a.location.coordinates.length === 2,
    );
}

// ─────────────────────────────────────────────────────────────────
// Bottom place card (Google Maps style)
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Removed bottom PlaceCard component as it is now a Popup
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Sortable Map Activity Row Helper
// ─────────────────────────────────────────────────────────────────

interface SortableMapActivityRowProps {
  activity: Activity;
  index: number;
  isSelected: boolean;
  color: string;
  currency: string;
  language?: Language;
  onSelect: () => void;
}

function SortableMapActivityRow({
  activity,
  index,
  isSelected,
  color,
  currency,
  language,
  onSelect,
}: SortableMapActivityRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity._id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative group flex items-start gap-2 rounded-lg py-1 px-1 transition-colors cursor-grab active:cursor-grabbing touch-none ${
        isSelected ? "bg-primary/10" : "hover:bg-muted/50"
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        aria-label={activity.name}
        className="text-left flex items-start gap-2 h-full cursor-pointer flex-1 min-w-0"
      >
        <span
          className="shrink-0 h-4 w-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold mt-0.5"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-medium leading-tight line-clamp-1 ${
              isSelected ? "text-foreground" : ""
            }`}
          >
            {activity.name}
          </p>
          {(activity.time || activity.cost) && (
            <div className="flex items-center gap-2 mt-0.5">
              {activity.time && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                  {activity.time}
                </span>
              )}
              {activity.cost != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <DollarSign className="h-2.5 w-2.5" aria-hidden="true" />
                  {activity.cost > 0
                    ? new Intl.NumberFormat(getLocaleCode(language), {
                        style: "currency",
                        currency: currency,
                        maximumFractionDigits: currency === "VND" ? 0 : 2,
                      }).format(convertCurrency(activity.cost, "USD", currency))
                    : "Free"}
                </span>
              )}
              {activity.cost == null && activity.priceLevel != null && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <DollarSign className="h-2.5 w-2.5" aria-hidden="true" />
                  {activity.priceLevel > 0
                    ? formatPriceLevel(activity.priceLevel, currency, language)
                    : "Free"}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

interface TripMapViewProps {
  trip: Trip;
}

export function TripMapView({ trip }: TripMapViewProps) {
  const { t, currency, language } = useTranslationStore();
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [isIsolatedView, setIsIsolatedView] = useState<boolean>(
    trip.itinerary.length > 7,
  );
  const [selectedActivity, setSelectedActivity] =
    useState<SelectedActivity | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const mapContainerId = `trip-map-${trip._id}`;

  const sortedDays = [...trip.itinerary].sort((a, b) => a.day - b.day);
  const hasCoords = hasCoordinates(trip.itinerary);
  const initialCenter = getInitialCenter(trip.itinerary);

  const { map, isLoaded, error } = useMap({
    containerId: mapContainerId,
    center: initialCenter,
    zoom: 13,
  });

  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const { mutate: reorderActivities } = useReorderActivities();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent, dayIndex: number) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    if (!trip) return;
    const day = trip.itinerary[dayIndex];
    if (!day) return;

    const sorted = getValidActivities(day);
    const oldIndex = sorted.findIndex((a) => a._id === active.id);
    const newIndex = sorted.findIndex((a) => a._id === over.id);
    if (oldIndex === newIndex || oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);

    reorderActivities({
      tripId: trip._id,
      dayIndex,
      orderedActivityIds: reordered.map((a) => a._id!),
    });
  };

  const { flyToDay, selectActivity } = useTripMarkers({
    map,
    isLoaded,
    itinerary: trip.itinerary,
    currency,
    language,
    isolatedDayNumber: isIsolatedView ? activeDay : null,
    onMarkerClick: setActiveDay,
    onActivityClick: (sel) => {
      setSelectedActivity(sel);
      setActiveDay(sel.dayNumber);
    },
  });

  const handleDayClick = (dayNumber: number) => {
    setActiveDay(dayNumber);
    setSelectedActivity(null);
    flyToDay(dayNumber);
  };

  if (!hasCoords) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4 rounded-2xl border bg-muted/20">
        <div className="p-4 rounded-full bg-primary/10">
          <MapPin className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-lg">{t("map.noCoords")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("map.noCoordsDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: "480px" }}>
      {/* ── FULLSCREEN MAP ────────────────────────────────────── */}
      <div
        id={mapContainerId}
        className="absolute inset-0 rounded-2xl overflow-hidden w-full h-full bg-muted/20"
      />

      {/* Loading overlay */}
      {!isLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm rounded-2xl z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading map…</p>
          </div>
        </div>
      )}

      {error && (
        <WidgetError
          title={t("explore.mapUnavailable")}
          message={error}
          className="absolute inset-0 z-10 rounded-2xl"
        />
      )}

      {/* ── FLOATING LEFT PANEL ───────────────────────────────── */}
      <div
        className={`absolute top-4 left-4 bottom-4 z-20 flex transition-all duration-300 ease-in-out ${
          panelOpen ? "translate-x-0" : "-translate-x-[calc(100%-2.5rem)]"
        }`}
        style={{ width: "280px" }}
      >
        {/* Panel body */}
        <div
          className={`flex-1 min-w-0 bg-background/95 backdrop-blur-md border border-border/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-border/50">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold text-sm tracking-wide uppercase text-muted-foreground">
                  {t("trip.itinerary")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sortedDays.length} days ·{" "}
                  {trip.itinerary.reduce(
                    (s, d) => s + getValidActivities(d).length,
                    0,
                  )}{" "}
                  {t("map.activities")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-muted/30 rounded-lg p-2 mt-2">
              <Label
                htmlFor="isolate-mode"
                className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer"
              >
                <Filter className="h-3 w-3" />
                {t("map.isolateDay")}
              </Label>
              <Switch
                id="isolate-mode"
                checked={isIsolatedView}
                onCheckedChange={setIsIsolatedView}
                className="scale-75"
              />
            </div>
          </div>

          {/* Day list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sortedDays.map((day) => {
              const color = getDayColor(day.day);
              const bg = getDayColorLight(day.day);
              const isActive = activeDay === day.day;
              const activities = getValidActivities(day);

              const isExpanded = !!expandedDays[day.day];
              const displayCount = isExpanded ? activities.length : 5;
              const visibleActivities = activities.slice(0, displayCount);
              const dayIndex = trip.itinerary.findIndex(
                (d) => d.day === day.day,
              );

              return (
                <div
                  key={day.day}
                  onClick={() => handleDayClick(day.day)}
                  className={`w-full text-left rounded-xl p-3 transition-all duration-200 cursor-pointer border ${
                    isActive
                      ? "shadow-md scale-[1.01]"
                      : "border-transparent hover:border-border/60 hover:shadow-sm hover:scale-[1.005]"
                  }`}
                  style={
                    isActive
                      ? { backgroundColor: bg, borderColor: color }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-sm">
                      {t("map.day")} {day.day}
                    </span>
                    <span
                      className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: bg, color }}
                    >
                      {activities.length}
                    </span>
                  </div>

                  {activities.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic pl-5">
                      No location data
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      onDragEnd={(e: DragEndEvent) =>
                        handleDragEnd(e, dayIndex)
                      }
                    >
                      <SortableContext
                        items={visibleActivities.map((a) => a._id!)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ol className="space-y-1.5 -ml-1">
                          {visibleActivities.map((act, idx) => {
                            const actId = act._id ?? `day${day.day}-idx${idx}`;
                            const [lng, lat] = (act.location?.coordinates ?? [
                              0, 0,
                            ]) as [number, number];
                            const isSelected =
                              selectedActivity?.activity._id === act._id &&
                              selectedActivity?.dayNumber === day.day;
                            return (
                              <SortableMapActivityRow
                                key={actId}
                                activity={act}
                                index={idx}
                                color={color}
                                currency={currency}
                                language={language}
                                isSelected={isSelected}
                                onSelect={() => {
                                  selectActivity(actId, lng, lat);
                                }}
                              />
                            );
                          })}
                        </ol>
                      </SortableContext>
                    </DndContext>
                  )}
                  {!isExpanded && activities.length > 5 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDays((prev) => ({
                          ...prev,
                          [day.day]: true,
                        }));
                      }}
                      className="mt-2 text-[10px] font-semibold text-primary hover:underline pl-7"
                    >
                      + {activities.length - 5} more mapped stops...
                    </button>
                  )}
                  {isExpanded && activities.length > 5 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedDays((prev) => ({
                          ...prev,
                          [day.day]: false,
                        }));
                      }}
                      className="mt-2 text-[10px] font-semibold text-muted-foreground hover:underline pl-7"
                    >
                      Show less
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setPanelOpen((p) => !p)}
          aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
          className="self-center ml-2 h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-background/95 backdrop-blur-md border border-border/60 shadow-lg hover:bg-muted transition-colors duration-200 cursor-pointer"
        >
          {panelOpen ? (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
