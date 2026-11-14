/**
 * Trip Detail Page
 *
 * Main planner view for a single trip — shows a rich itinerary timeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useJobPoller,
  useTrip,
  useReorderActivities,
  useRegenActivity,
} from "@/features/planner/hooks";
import { useLoadNextChunk } from "@/features/planner/hooks/useLoadNextChunk";
import { useTrackTripViewed } from "@/features/planner/hooks/useTrackTripViewed";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  formatDateRange,
  getTripDuration,
  getLocalizedTripTitle,
} from "@/utils/format";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AgentLockBanner } from "../components/AgentLockBanner";
import { BackgroundProcessingModal } from "../components/BackgroundProcessingModal";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { ItineraryDayCard } from "../components/ItineraryDayCard";
import { TripDetailHeader } from "../components/trip-detail/TripDetailHeader";
import { TripDetailActionsMenu } from "../components/trip-detail/TripDetailActionsMenu";
import { TripDetailDayStrip } from "../components/trip-detail/TripDetailDayStrip";
import { TripDetailSummaryRail } from "../components/trip-detail/TripDetailSummaryRail";
import { resolveItineraryDayIndex } from "../components/trip-detail/resolve-itinerary-day-index";
import type { ItineraryDay } from "@/utils/schemas";
import { DataError } from "@/components/DataError";
import { PageLoader } from "@/components/PageLoader";
import { retryJob, cancelJob } from "../api/jobs.api";
import { toast } from "sonner";
import { CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import { useUpdateTrip, useUpdateTripLifecycle } from "../hooks/useTrips";
import { isAxiosError } from "axios";
import { apiClient } from "@/lib/axios";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import type { TripLifecycle } from "@travelplan/shared";

export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { data: trip, isLoading, error } = useTrip(tripId);
  useTrackTripViewed(trip?._id);
  const { language, t, currency: preferredCurrency } = useTranslationStore();
  const queryClient = useQueryClient();
  const { mutate: updateLifecycle, isPending: isUpdatingLifecycle } =
    useUpdateTripLifecycle();
  const { mutate: updateTrip, isPending: isUpdatingTrip } = useUpdateTrip();
  const { mutate: reorderActivities, isPending: isReordering } =
    useReorderActivities();
  const {
    mutate: regenActivity,
    isPending: isRegening,
    variables: regenVariables,
  } = useRegenActivity();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isReGeocoding, setIsReGeocoding] = useState(false);
  const [canUndo, setCanUndo] = useState(true);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const { autoLoadLongTripChunks } = useSubscriptionStore();
  const { setActiveJob, clearActiveJob } = useActiveJobStore();

  useEffect(() => {
    if (trip?.isAgentProcessing && trip.agentJobId && tripId) {
      setActiveJobId(trip.agentJobId);
      setActiveJob(trip.agentJobId, tripId);
      setJobError(null);
    }
  }, [trip?.agentJobId, trip?.isAgentProcessing, tripId, setActiveJob]);

  // ── Debug: log trip data whenever it loads or is refreshed (dev only —
  // Vite dead-code-eliminates this block from production builds) ──
  useEffect(() => {
    if (!trip || !import.meta.env.DEV) return;
    const title = getLocalizedTripTitle(trip.title, t);
    console.groupCollapsed(
      `[TripDetailPage] 🗺️ Trip loaded — "${title}" (${trip._id})`,
    );
    console.log(
      "Status:",
      trip.status,
      "| isAgentProcessing:",
      trip.isAgentProcessing,
    );
    console.log("Dates:", trip.startDate, "→", trip.endDate);
    console.log("Itinerary days:", trip.itinerary.length);
    trip.itinerary.forEach((day) => {
      console.groupCollapsed(`  Day ${day.day} — ${day.date}`);
      day.activities.forEach((a, i) =>
        console.log(
          `    [${i + 1}] ${a.time ?? "?:??"} | ${a.type} | ${a.name}`,
        ),
      );
      console.groupEnd();
    });
    console.log("Full trip object:", trip);
    console.groupEnd();
  }, [trip, t]);

  // ── Debug: log when AI job finishes and itinerary is ready to render
  // (dev only) ──
  useEffect(() => {
    if (
      !trip ||
      !import.meta.env.DEV ||
      trip.isAgentProcessing ||
      trip.itinerary.length === 0
    )
      return;
    const title = getLocalizedTripTitle(trip.title, t);
    console.group(
      `[TripDetailPage] ✅ Itinerary READY — "${title}" | ${trip.itinerary.length} day(s)`,
    );
    trip.itinerary.forEach((day) => {
      const dateOnly = day.date.slice(0, 10);
      console.log(
        `\n  ── Day ${day.day}  (${dateOnly}) ──────────────────────`,
      );
      day.activities.forEach((a) => {
        const time = a.time ?? "--:--";
        const end = a.endTime ?? "";
        const range = end ? `${time} – ${end}` : time;
        const cost = a.cost ? ` | $${a.cost}` : "";
        const rating = a.rating != null ? ` | ⭐ ${a.rating}` : " | ⭐ none";
        const photo = a.photoUrl
          ? ` | 📸 ${a.photoUrl.slice(0, 60)}…`
          : " | 📸 none";
        const hours = a.openingHours ? ` | 🕐 ${a.openingHours}` : " | 🕐 none";
        console.log(
          `    ${range}  [${a.type}]  ${a.name}${cost}${rating}${photo}${hours}`,
        );
      });
    });
    console.groupEnd();
  }, [trip, t, trip?.isAgentProcessing]);

  const jobState = useJobPoller({
    jobId: activeJobId,
    onComplete: () => setActiveJobId(null),
    onError: (errorMessage) => setJobError(errorMessage),
  });

  const handleRetry = useCallback(async () => {
    if (!activeJobId) return;
    setIsRetrying(true);
    try {
      const result = await retryJob(activeJobId);
      setActiveJobId(result.jobId);
      setJobError(null);
      toast.success("Retry queued. The agent is working again.");
    } catch (retryError: unknown) {
      const message =
        retryError instanceof Error
          ? retryError.message
          : "Failed to retry trip generation";
      setJobError(message);
      toast.error(message);
    } finally {
      setIsRetrying(false);
    }
  }, [activeJobId]);

  const { mutate: cancelTripJob, isPending: isCancelling } = useMutation({
    mutationFn: (id: string) => cancelJob(id),
    onSuccess: () => {
      toast.success("Trip generation cancelled.");
      setActiveJobId(null);
      clearActiveJob();
      if (tripId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.trips.detail(tripId),
        });
      }
    },
    onError: (err: unknown) => {
      const data = isAxiosError(err) ? err.response?.data : undefined;
      const msg =
        data &&
        typeof data === "object" &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : "";
      toast.error(msg || "Failed to cancel trip generation.");
    },
  });

  const handleCancelClick = useCallback(() => {
    if (tripId) {
      cancelTripJob(tripId);
    }
  }, [tripId, cancelTripJob]);

  const handleUndo = useCallback(async () => {
    if (!tripId) return;
    setIsUndoing(true);
    try {
      await apiClient.patch(`/trips/${tripId}/undo`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.trips.detail(tripId),
      });
      toast.success(t("trip.undoSuccess"));
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setCanUndo(false);
        toast.info(t("trip.undoEmpty"));
      } else {
        toast.error(t("trip.undoFailed"));
      }
    } finally {
      setIsUndoing(false);
    }
  }, [tripId, queryClient, t]);

  const handleReGeocode = useCallback(async () => {
    if (!tripId) return;
    setIsReGeocoding(true);
    const toastId = toast.loading(t("trip.reGeocodeLoading"));
    try {
      const res = await apiClient.post(`/trips/${tripId}/regeocode`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.trips.detail(tripId),
      });
      toast.success(
        t("trip.reGeocodeSuccess")
          .replace("{updated}", String(res.data.updated))
          .replace("{failed}", String(res.data.failed)),
        { id: toastId },
      );
    } catch {
      toast.error(t("trip.reGeocodeFailed"), { id: toastId });
    } finally {
      setIsReGeocoding(false);
    }
  }, [tripId, queryClient, t]);

  const handleEditTitle = () => {
    if (!trip) return;
    setEditTitleValue(trip.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (!trip) return;
    const trimmed = editTitleValue.trim();
    if (trimmed && trimmed !== trip.title) {
      updateTrip({ tripId: trip._id, data: { title: trimmed } });
    }
    setIsEditingTitle(false);
  };

  const handleKeyDownTitle = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveTitle();
    if (e.key === "Escape") setIsEditingTitle(false);
  };

  // ── DnD sensors: require 8px movement before drag starts (prevents misclicks)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent, dayEntity: ItineraryDay) => {
      const { active, over } = event;

      // Guard 1: dropped outside any droppable area
      if (!over) return;
      // Guard 2: dropped on itself — nothing to do
      if (active.id === over.id) return;

      if (!trip) return;
      const itineraryDayIndex = resolveItineraryDayIndex(
        trip.itinerary,
        dayEntity,
      );
      if (itineraryDayIndex < 0) return;
      const day = trip.itinerary[itineraryDayIndex];
      if (!day) return;

      const sorted = day.activities.slice().sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        return 0;
      });

      const oldIndex = sorted.findIndex((a) => a._id === active.id);
      const newIndex = sorted.findIndex((a) => a._id === over.id);

      // Guard 3: index didn't actually change
      if (oldIndex === newIndex) return;

      const reordered = arrayMove(sorted, oldIndex, newIndex);

      reorderActivities({
        tripId: trip._id,
        dayIndex: itineraryDayIndex,
        orderedActivityIds: reordered.map((a) => a._id!),
      });
    },
    [trip, reorderActivities],
  );

  const handleRegenActivity = useCallback(
    (dayIndex: number, activityId: string, hint?: string) => {
      if (!trip) return;
      regenActivity({ tripId: trip._id, dayIndex, activityId, hint });
    },
    [trip, regenActivity],
  );

  // Chunk loading for Pro trips > 5 days
  const totalChunks = trip?.totalChunks ?? 0;
  const isChunkedTrip = totalChunks > 1;
  const { allChunksLoaded, isLoadingChunk, loadNextChunk } = useLoadNextChunk(
    tripId,
    totalChunks,
    isChunkedTrip ? Math.ceil((trip?.itinerary?.length ?? 0) / 3) : 0,
  );

  // IntersectionObserver: fire loadNextChunk when user scrolls near the last day
  const lastDayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (
      !autoLoadLongTripChunks ||
      !isChunkedTrip ||
      allChunksLoaded ||
      !lastDayRef.current
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextChunk();
      },
      { rootMargin: "200px" },
    );
    observer.observe(lastDayRef.current);
    return () => observer.disconnect();
  }, [
    autoLoadLongTripChunks,
    isChunkedTrip,
    allChunksLoaded,
    loadNextChunk,
    trip?.itinerary?.length,
  ]);

  const sortedDays = useMemo(
    () =>
      !trip?.itinerary?.length
        ? []
        : trip.itinerary.slice().sort((a, b) => a.day - b.day),
    [trip],
  );

  const totalStops = useMemo(
    () =>
      !trip?.itinerary?.length
        ? 0
        : trip.itinerary.reduce((n, d) => n + d.activities.length, 0),
    [trip],
  );

  const activeDay = sortedDays[activeDayIndex] ?? null;

  const activeDayCoordinates = useMemo(() => {
    if (!activeDay) return [] as Array<[number, number]>;
    return activeDay.activities
      .map((activity) => activity.location?.coordinates)
      .filter(
        (coordinates): coordinates is [number, number] =>
          Array.isArray(coordinates) && coordinates.length === 2,
      );
  }, [activeDay]);

  const allTripCoordinates = useMemo(() => {
    if (!trip?.itinerary?.length) return [] as Array<[number, number]>;
    return trip.itinerary.flatMap((day) =>
      day.activities
        .map((activity) => activity.location?.coordinates)
        .filter(
          (coordinates): coordinates is [number, number] =>
            Array.isArray(coordinates) && coordinates.length === 2,
        ),
    );
  }, [trip]);

  useEffect(() => {
    setActiveDayIndex(0);
  }, [trip?._id]);

  useEffect(() => {
    if (sortedDays.length === 0) return;
    setActiveDayIndex((i) => Math.min(i, sortedDays.length - 1));
  }, [sortedDays.length]);

  if (isLoading) return <PageLoader />;

  if (error || !trip) {
    return (
      <DashboardLayout>
        <DataError
          message={error?.message || "Trip not found"}
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  // ── Does this trip have any geocoded activities? ─────────────
  const hasMapData = trip.itinerary.some((day) =>
    day.activities.some(
      (a) => a.location?.coordinates && a.location.coordinates.length === 2,
    ),
  );

  // ── Date range label ──────────────────────────────────────
  const dateRange = (() => {
    try {
      return formatDateRange(trip.startDate, trip.endDate, language);
    } catch {
      return "";
    }
  })();

  const totalDays = getTripDuration(trip.startDate, trip.endDate);
  const isFallback = trip?.status === "FALLBACK";
  // QUEUED has no agent lock yet, so isAgentProcessing alone misses it.
  const isGenerating =
    trip.isAgentProcessing ||
    trip.status === "QUEUED" ||
    trip.status.startsWith("PROCESSING");

  const itineraryDayIndex =
    activeDay != null
      ? resolveItineraryDayIndex(trip.itinerary, activeDay)
      : -1;
  const isLastActiveDay =
    sortedDays.length > 0 && activeDayIndex === sortedDays.length - 1;

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 space-y-6">
        <AgentLockBanner
          isLocked={trip.isAgentProcessing}
          currentStep={jobState.currentStep}
          status={
            trip.isAgentProcessing && jobState.status === "IDLE"
              ? "PROCESSING"
              : jobState.status
          }
          progress={jobState.progress}
          error={jobError || jobState.error}
          jobId={activeJobId}
          onRetry={activeJobId ? handleRetry : undefined}
          isRetrying={isRetrying}
          onCancel={handleCancelClick}
          isCancelling={isCancelling}
          isFallback={isFallback}
          fallbackCity={trip?.destination?.split(",")[0]}
        />

        <BackgroundProcessingModal
          isProcessing={trip.isAgentProcessing}
          currentStep={jobState.currentStep}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-6 lg:gap-8 items-start">
          <div className="space-y-6 min-w-0 max-w-3xl w-full">
            <TripDetailHeader
              tripTitleLocalized={getLocalizedTripTitle(trip.title, t)}
              isEditingTitle={isEditingTitle}
              editTitleValue={editTitleValue}
              onEditTitleValueChange={setEditTitleValue}
              onStartEditTitle={handleEditTitle}
              onSaveTitle={handleSaveTitle}
              onCancelEditTitle={() => setIsEditingTitle(false)}
              onTitleKeyDown={handleKeyDownTitle}
              isUpdatingTrip={isUpdatingTrip}
              actions={
                <TripDetailActionsMenu
                  tripId={trip._id}
                  tripStatus={trip.status}
                  isAgentProcessing={trip.isAgentProcessing}
                  hasMapData={hasMapData}
                  dateRange={dateRange}
                  totalDays={totalDays}
                  lifecycle={trip.lifecycle}
                  onLifecycleChange={(val) =>
                    updateLifecycle({
                      tripId: trip._id,
                      lifecycle: val as TripLifecycle,
                    })
                  }
                  isUpdatingLifecycle={isUpdatingLifecycle}
                  showFixLocations={trip.status === "COMPLETED"}
                  isReGeocoding={isReGeocoding}
                  onReGeocode={handleReGeocode}
                  showUndo={!trip.isAgentProcessing}
                  canUndo={canUndo}
                  isUndoing={isUndoing}
                  onUndo={handleUndo}
                  onViewMap={() => navigate(`/map/${trip._id}`)}
                />
              }
            />

            {sortedDays.length > 1 ? (
              <TripDetailDayStrip
                sortedDays={sortedDays}
                activeIndex={activeDayIndex}
                onSelectDay={setActiveDayIndex}
                language={language}
              />
            ) : null}

            <div data-testid="trip-detail-itinerary">
              <h2 className="text-xl font-semibold mb-4">
                {t("trip.itinerary")}
              </h2>
              {isChunkedTrip && (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {t("trip.longTripBanner")}
                </div>
              )}

              {trip.itinerary.length === 0 && isGenerating ? (
                <div
                  data-testid="trip-generating-state"
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-border bg-muted/30 p-8 text-center"
                >
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                  <p className="font-medium mb-1">{t("trip.generating")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("trip.generatingDesc")}
                  </p>
                </div>
              ) : trip.itinerary.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/30 p-8 text-center transition-shadow duration-200">
                  <CalendarDays className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="font-medium mb-1">{t("trip.noItinerary")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("trip.noItineraryDesc")}
                  </p>
                  <Button asChild size="sm" className="mt-4">
                    <Link to="/trips" data-testid="trip-empty-itinerary-cta">
                      {t("trip.noItineraryCta")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeDay != null && itineraryDayIndex >= 0 ? (
                    <div
                      key={activeDay._id ?? activeDay.day}
                      ref={
                        isLastActiveDay && isChunkedTrip
                          ? lastDayRef
                          : undefined
                      }
                    >
                      <DndContext
                        sensors={sensors}
                        onDragEnd={(event: DragEndEvent) =>
                          handleDragEnd(event, activeDay)
                        }
                      >
                        <ItineraryDayCard
                          day={activeDay}
                          dayIndex={itineraryDayIndex}
                          currency={trip.budget.currency}
                          isDragDisabled={
                            trip.isAgentProcessing ||
                            isReordering ||
                            isRegening ||
                            isFallback
                          }
                          regenningActivityId={
                            isRegening &&
                            regenVariables?.dayIndex === itineraryDayIndex
                              ? regenVariables.activityId
                              : null
                          }
                          onRegenActivity={handleRegenActivity}
                        />
                      </DndContext>
                    </div>
                  ) : null}

                  {isChunkedTrip && !allChunksLoaded && (
                    <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                      <p
                        className={
                          isLoadingChunk
                            ? "animate-pulse motion-reduce:animate-none"
                            : ""
                        }
                      >
                        {isLoadingChunk
                          ? t("trip.chunkLoading")
                          : autoLoadLongTripChunks
                            ? t("trip.chunkAutoLoading")
                            : t("trip.chunkLoadMoreHint")}
                      </p>
                      {!autoLoadLongTripChunks && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 min-h-10 cursor-pointer transition-colors duration-200"
                          onClick={() => void loadNextChunk()}
                          disabled={isLoadingChunk}
                        >
                          {t("trip.chunkLoadMoreCta")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <TripDetailSummaryRail
            tripId={trip._id}
            destination={trip.destination}
            activeDayDate={activeDay?.date}
            activeDayCoordinates={activeDayCoordinates}
            allTripCoordinates={allTripCoordinates}
            dateRange={dateRange}
            totalCalendarDays={totalDays}
            totalStops={totalStops}
            budgetTotal={trip.budget.totalLimit}
            budgetCurrency={trip.budget.currency}
            preferredCurrency={preferredCurrency}
            showViewOnMap={trip.status === "COMPLETED" && hasMapData}
            onViewMap={() => navigate(`/map/${trip._id}`)}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
