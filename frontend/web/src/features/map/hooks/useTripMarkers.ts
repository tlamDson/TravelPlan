/**
 * useTripMarkers
 *
 * Renders itinerary activities as Mapbox markers grouped by day.
 *
 * KEY DESIGN: All Marker *instances* are stored in a ref so they can be
 * properly .remove()'d on cleanup. Previously only layer/source IDs were
 * tracked and Markers were never removed, causing ghost markers with no
 * event listeners to accumulate on every render.
 *
 * Selected state: click marker → scale 1.4× + glow ring.
 * Click background → deselect.
 */

import { useEffect, useRef, useCallback } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { ItineraryDay, Activity } from "@/utils/schemas";
import { getDayColor, withAlpha } from "../utils/dayColors";
import {
  convertCurrency,
  formatPriceLevel,
  getLocaleCode,
} from "@/utils/format";
import type { Language } from "@/stores/useTranslationStore";

// Inject ping keyframe CSS once into the document
const PING_STYLE_ID = "mapbox-ping-style";
function ensurePingStyle() {
  if (document.getElementById(PING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PING_STYLE_ID;
  style.textContent = `
    @keyframes map-ping {
      0%   { transform: scale(1);   opacity: 0.75; }
      80%  { transform: scale(3.5); opacity: 0; }
      100% { opacity: 0; }
    }
    .map-ping-active {
      animation: map-ping 1.3s cubic-bezier(0, 0, 0.2, 1) infinite !important;
      opacity: 0.75 !important;
    }
  `;
  document.head.appendChild(style);
}

export interface SelectedActivity {
  activity: Activity;
  dayNumber: number;
  /** 1-based stop index within the day */
  stopIndex: number;
  color: string;
}

interface UseTripMarkersOptions {
  map: MapboxMap | null;
  isLoaded: boolean;
  itinerary: ItineraryDay[];
  onActivityClick?: (selected: SelectedActivity) => void;
  onMarkerClick?: (dayNumber: number) => void;
  currency?: string;
  language?: Language;
  isolatedDayNumber?: number | null;
}

// Sort activities within a day by order field, fallback to time string
function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    // Primary: order field
    const diff = (a.order ?? 0) - (b.order ?? 0);
    if (diff !== 0) return diff;
    // Fallback: time string "HH:MM"
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}

function isValidCoord(act: Activity): boolean {
  const c = act.location?.coordinates;
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    isFinite(c[0]) &&
    isFinite(c[1]) &&
    c[0] !== 0 &&
    c[1] !== 0
  );
}

export function useTripMarkers({
  map,
  isLoaded,
  itinerary,
  onActivityClick,
  onMarkerClick,
  currency = "USD",
  language,
  isolatedDayNumber,
}: UseTripMarkersOptions) {
  const markerInstancesRef = useRef<Marker[]>([]);
  // Map from activityId → { el, color, activity, dayNumber, stopIndex }
  const markerDataRef = useRef<
    Map<
      string,
      {
        el: HTMLElement;
        markerInstance: Marker;
        color: string;
        activity: Activity;
        dayNumber: number;
        stopIndex: number;
      }
    >
  >(new Map());
  const addedLayerIds = useRef<string[]>([]);
  const addedSourceIds = useRef<string[]>([]);
  const selectedElRef = useRef<HTMLElement | null>(null);

  const deselect = useCallback(() => {
    // Hide all popups
    markerInstancesRef.current.forEach((m) => m.getPopup()?.remove());

    if (selectedElRef.current) {
      selectedElRef.current.style.transform = "scale(1)";
      selectedElRef.current.style.boxShadow = "0 2px 6px rgba(0,0,0,0.35)";
      selectedElRef.current.style.zIndex = "1";
      // Hide the inline ping ring
      const ring =
        selectedElRef.current.querySelector<HTMLElement>(".ping-ring");
      if (ring) {
        ring.style.opacity = "0";
        ring.classList.remove("map-ping-active");
      }
      selectedElRef.current = null;
    }
  }, []);

  const selectEl = useCallback(
    (el: HTMLElement, color: string) => {
      deselect();
      el.style.transform = "scale(1.5)";
      el.style.boxShadow = `0 0 0 4px ${withAlpha(color, 0.33)}, 0 6px 16px rgba(0,0,0,0.45)`;
      el.style.zIndex = "100";
      selectedElRef.current = el;
      // Show the inline ping ring
      ensurePingStyle();
      const ring = el.querySelector<HTMLElement>(".ping-ring");
      if (ring) {
        ring.style.opacity = "1";
        ring.classList.add("map-ping-active");
      }
    },
    [deselect],
  );

  // ── Full cleanup: remove layers, sources AND marker instances ─
  const cleanup = useCallback(() => {
    if (!map) return;
    markerInstancesRef.current.forEach((m) => m.remove());
    markerInstancesRef.current = [];
    markerDataRef.current.clear();

    // Remove GL layers
    for (const id of [...addedLayerIds.current].reverse()) {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch {
        /* map might be destroyed */
      }
    }
    // Remove GL sources
    for (const id of [...addedSourceIds.current].reverse()) {
      try {
        if (map.getSource(id)) map.removeSource(id);
      } catch {
        /* map might be destroyed */
      }
    }

    addedLayerIds.current = [];
    addedSourceIds.current = [];
    selectedElRef.current = null;
  }, [map]);

  // ── Main effect: build markers + lines ─────────────────────
  useEffect(() => {
    if (!map || !isLoaded || itinerary.length === 0) return;

    const allCoords: [number, number][] = [];
    const allDays = [...itinerary].sort((a, b) => a.day - b.day);
    const sortedDays = isolatedDayNumber
      ? allDays.filter((d) => d.day === isolatedDayNumber)
      : allDays;

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      sortedDays.forEach((day) => {
        const dayColor = getDayColor(day.day);
        const sourceId = `day-${day.day}-src`;
        const layerId = `day-${day.day}-lyr`;

        // Sort activities correctly
        const validActivities = sortActivities(day.activities).filter(
          isValidCoord,
        );

        if (validActivities.length === 0) return;

        const lineCoords: [number, number][] = validActivities.map((act) => {
          const [rawLng, rawLat] = act.location!.coordinates;
          const lng = Number(rawLng);
          const lat = Number(rawLat);
          allCoords.push([lng, lat]);
          return [lng, lat];
        });

        // ── Connecting dashed line
        if (lineCoords.length > 1) {
          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: lineCoords },
            },
          });
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": dayColor,
              "line-width": 2.5,
              "line-dasharray": [2, 1.2],
              "line-opacity": 0.65,
            },
          });
          addedSourceIds.current.push(sourceId);
          addedLayerIds.current.push(layerId);
        }

        // ── One marker per activity ─────────────────────────
        validActivities.forEach((act, idx) => {
          const [rawLng, rawLat] = act.location!.coordinates;
          const lng = Number(rawLng);
          const lat = Number(rawLat);
          const actId = act._id ?? `day${day.day}-idx${idx}`;

          const el = document.createElement("div");
          el.className = "trip-marker"; // Add class for potential future global targeting
          Object.assign(el.style, {
            position: "absolute",
            width: "30px",
            height: "30px",
            borderRadius: "50%",
            background: dayColor,
            border: "3px solid #fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: "700",
            fontSize: "11px",
            fontFamily: "system-ui, sans-serif",
            cursor: "pointer",
            userSelect: "none",
            transition: "box-shadow 200ms ease", // Removed transform transition to not fight Mapbox
            zIndex: "1",
          });
          // Remove position relative - let mapbox gl css handle positioning

          // Inline ping ring — shown on selection via .map-ping-active
          const pingRing = document.createElement("span");
          pingRing.className = "ping-ring";
          Object.assign(pingRing.style, {
            position: "absolute",
            inset: "-4px",
            borderRadius: "50%",
            backgroundColor: "#ef4444",
            opacity: "0",
            pointerEvents: "none",
            zIndex: "-1",
          });
          el.appendChild(pingRing);

          el.textContent = String(idx + 1);
          el.setAttribute("aria-label", act.name);

          // ── Create Popup Content ──────────────────────────────
          const timeText = act.time
            ? `${act.time}${act.endTime ? ` – ${act.endTime}` : ""}`
            : "";

          let costText = "";
          if (act.cost != null) {
            const converted = convertCurrency(act.cost, "USD", currency);
            const formatter = new Intl.NumberFormat(getLocaleCode(language), {
              style: "currency",
              currency: currency,
              maximumFractionDigits: currency === "VND" ? 0 : 2,
            });
            costText = act.cost > 0 ? formatter.format(converted) : "Free";
          } else if (act.priceLevel != null) {
            costText =
              act.priceLevel > 0
                ? formatPriceLevel(act.priceLevel, currency, language)
                : "Free";
          }

          const ratingText =
            act.rating != null ? `⭐ ${act.rating.toFixed(1)}` : "";
          const metaText = [timeText, costText, ratingText]
            .filter(Boolean)
            .join(" · ");

          let popupHtml = `
            <div class="px-3 py-2.5 max-w-[260px] font-sans">
              <div class="text-[9px] font-bold uppercase tracking-wider mb-1" style="color: ${dayColor};">
                Day ${day.day} · Stop ${idx + 1}
              </div>
              <h3 class="font-bold text-sm leading-tight text-slate-900 mb-1 mt-0">
                ${act.name}
              </h3>
          `;

          if (metaText) {
            popupHtml += `<p class="text-[11px] text-slate-500 m-0 mb-1.5 font-medium">${metaText}</p>`;
          }

          if (act.openingHours) {
            popupHtml += `<p class="text-[11px] text-slate-500 m-0 pt-1.5 border-t border-slate-200 line-clamp-1">🕐 ${act.openingHours}</p>`;
          }

          if (act.notes) {
            popupHtml += `<p class="text-[11px] text-slate-500 m-0 mt-1 italic leading-tight line-clamp-2">${act.notes}</p>`;
          }

          popupHtml += `</div>`;

          const popup = new mapboxgl.Popup({
            offset: 20,
            closeButton: false, // Let hover/click manage or use native simple close
            closeOnClick: false,
            className: "trip-map-popup",
          }).setHTML(popupHtml);

          // ── Create Marker ─────────────────────────────────────
          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(map);

          const handleClick = () => {
            selectEl(el, dayColor);
            map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });

            // Close all other popups
            markerInstancesRef.current.forEach((m) => {
              if (m !== marker) m.getPopup()?.remove();
            });

            marker.togglePopup(); // Show this popup
            onMarkerClick?.(day.day);
            onActivityClick?.({
              activity: act,
              dayNumber: day.day,
              stopIndex: idx + 1,
              color: dayColor,
            });
          };

          el.addEventListener("click", (e) => {
            e.stopPropagation();
            handleClick();
          });

          // Store marker data for programmatic selection from panel
          markerDataRef.current.set(actId, {
            el,
            markerInstance: marker,
            color: dayColor,
            activity: act,
            dayNumber: day.day,
            stopIndex: idx + 1,
          });

          markerInstancesRef.current.push(marker);
        });
      });

      // Fit bounds
      if (allCoords.length > 0) {
        const bounds = allCoords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]),
        );
        map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 1000 });
      }

      // Deselect on map background click
      map.on("click", deselect);
    });

    return () => {
      try {
        map.off("click", deselect);
      } catch {
        /* listener may already be removed */
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, itinerary, isolatedDayNumber]);

  // ── flyToDay: camera flies to first valid activity of a day ─
  const flyToDay = useCallback(
    (dayNumber: number) => {
      if (!map) return;
      const day = itinerary.find((d) => d.day === dayNumber);
      if (!day) return;
      const first = sortActivities(day.activities).find(isValidCoord);
      if (!first) return;
      const [lng, lat] = first.location!.coordinates as [number, number];
      map.flyTo({ center: [lng, lat], zoom: 14, duration: 900 });
    },
    [map, itinerary],
  );

  /** Programmatically select a marker from the left panel */
  const selectActivity = useCallback(
    (actId: string, lng: number, lat: number) => {
      const data = markerDataRef.current.get(actId);
      if (!data || !map) return;
      selectEl(data.el, data.color);
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });

      // Close all other popups then open this one
      markerInstancesRef.current.forEach((m) => m.getPopup()?.remove());
      data.markerInstance.togglePopup();

      onMarkerClick?.(data.dayNumber);
      onActivityClick?.({
        activity: data.activity,
        dayNumber: data.dayNumber,
        stopIndex: data.stopIndex,
        color: data.color,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, selectEl],
  );

  return { flyToDay, selectActivity, cleanup, deselect };
}
