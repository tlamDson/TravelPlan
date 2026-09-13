import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ChevronDown,
  Loader2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatDateRange,
  getTripDuration,
  formatCurrency,
  convertCurrency,
  getLocalizedTripTitle,
} from "@/utils/format";
import type { Trip } from "@/utils/schemas";
import { getCountryImage } from "@/utils/countryImage";
import { useDeleteTrip, useUpdateTripLifecycle } from "../hooks/useTrips";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { STATUS_TONE_STYLES, TRIP_STATUS_TONE } from "../lib/statusStyles";

interface TripCardProps {
  trip: Trip;
  priority?: boolean;
}

const LIFECYCLE_OPTIONS = [
  { value: "UPCOMING", labelKey: "trip.lifecycle_upcoming" },
  { value: "IN_TRIP", labelKey: "trip.lifecycle_in_trip" },
  { value: "COMPLETED", labelKey: "trip.lifecycle_completed" },
  { value: "CANCELLED", labelKey: "trip.lifecycle_cancelled" },
] as const;

const LIFECYCLE_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-600/80 text-blue-100",
  IN_TRIP: "bg-emerald-600/80 text-emerald-100",
  COMPLETED: "bg-slate-600/80 text-slate-200",
  CANCELLED: "bg-red-700/80 text-red-100",
};

export function TripCard({ trip, priority = false }: TripCardProps) {
  const duration = getTripDuration(trip.startDate, trip.endDate);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate: deleteTrip, isPending: isDeleting } = useDeleteTrip();
  const { mutate: updateLifecycle, isPending: isUpdating } =
    useUpdateTripLifecycle();
  const { language, t, currency: preferredCurrency } = useTranslationStore();

  const coverSrc =
    trip.coverImage ||
    getCountryImage(trip.destination || trip.title, trip._id) ||
    null;

  const convertedSpent = convertCurrency(
    trip.budget.totalSpent,
    trip.budget.currency,
    preferredCurrency,
  );

  const convertedLimit = convertCurrency(
    trip.budget.totalLimit,
    trip.budget.currency,
    preferredCurrency,
  );

  const budgetPercentage =
    convertedLimit > 0
      ? Math.round((convertedSpent / convertedLimit) * 100)
      : 0;

  const isAiDone = trip.status === "COMPLETED";
  const isAiFailed = trip.status === "FAILED";
  const isAiActive = !isAiDone && !isAiFailed;

  const currentLifecycle = trip.lifecycle;

  const formatStatusLabel = (status: string) =>
    status
      .toLowerCase()
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <>
      <div className="relative" data-testid={`trip-card-${trip._id}`}>
        <Link to={`/trips/${trip._id}`}>
          <Card className="group hover:border-primary/50 transition-all duration-300 hover:shadow-md overflow-hidden cursor-pointer">
            {/* ── Fixed-ratio image area ─────────────────────────────── */}
            <div className="aspect-video relative">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={getLocalizedTripTitle(trip.title, t)}
                  className="w-full h-full object-cover"
                  loading={priority ? undefined : "lazy"}
                  fetchPriority={priority ? "high" : "auto"}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
              )}
              {/* Dark gradient overlay for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />

              {/* ── Top-left: AI status badge (only when AI is still working) */}
              {isAiActive && (
                <div className="absolute top-3 left-3 flex gap-2 z-10">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${
                      STATUS_TONE_STYLES[TRIP_STATUS_TONE[trip.status]]
                        .overlayPillClassName
                    }`}
                  >
                    {formatStatusLabel(trip.status)}
                  </span>
                </div>
              )}

              {/* ── Failed badge */}
              {isAiFailed && (
                <div className="absolute top-3 left-3 z-10">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${STATUS_TONE_STYLES.danger.overlayPillClassName}`}
                  >
                    {t("trip.lifecycle_failed")}
                  </span>
                </div>
              )}

              {/* ── AI Processing pulse (extra pill) */}
              {trip.isAgentProcessing && (
                <div className="absolute top-3 left-3 z-10">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/90 text-primary-foreground flex items-center gap-1 backdrop-blur-sm shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    AI
                  </span>
                </div>
              )}

              {/* ── Top-right: Lifecycle pill dropdown (only after AI done) */}
              {isAiDone && (
                <div
                  className="absolute top-3 left-3 z-10"
                  onClick={(e) => e.preventDefault()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm transition-opacity hover:opacity-90 focus:outline-none ${
                          LIFECYCLE_COLORS[currentLifecycle] ??
                          LIFECYCLE_COLORS.UPCOMING
                        }`}
                        disabled={isUpdating}
                        aria-label={t("trip.changeStatus")}
                      >
                        {isUpdating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            {t(
                              LIFECYCLE_OPTIONS.find(
                                (o) => o.value === currentLifecycle,
                              )?.labelKey ?? "trip.lifecycle_upcoming",
                            )}
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-36">
                      {LIFECYCLE_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          className={`text-xs cursor-pointer focus:text-white transition-colors pl-3 pr-4 ${
                            currentLifecycle === opt.value
                              ? LIFECYCLE_COLORS[opt.value]
                              : "focus:bg-accent focus:text-accent-foreground"
                          }`}
                          onSelect={() =>
                            updateLifecycle({
                              tripId: trip._id,
                              lifecycle: opt.value,
                            })
                          }
                        >
                          {t(opt.labelKey)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* ── Card body ───────────────────────────────────────────── */}
            <CardContent className="p-4 space-y-2">
              <h3
                className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-1"
                data-testid="trip-card-title"
              >
                {getLocalizedTripTitle(trip.title, t)}
              </h3>

              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-1">
                  {formatDateRange(trip.startDate, trip.endDate, language)}
                  {duration > 0 && ` · ${duration}-day trip`}
                </span>
              </div>

              {trip.budget.totalLimit > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Budget</span>
                    <span>
                      {formatCurrency(
                        convertedSpent,
                        preferredCurrency,
                        language,
                      )}
                      {" / "}
                      {formatCurrency(
                        convertedLimit,
                        preferredCurrency,
                        language,
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        budgetPercentage > 90
                          ? "bg-destructive"
                          : budgetPercentage > 70
                            ? "bg-yellow-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* ⋮ Actions Menu — top-right corner, outside Link */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-background/70 backdrop-blur-sm hover:bg-background border border-border/40 shadow-sm z-10"
              aria-label="Trip actions"
              onClick={(e) => e.preventDefault()}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MoreVertical className="h-3.5 w-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              disabled={isDeleting || trip.isAgentProcessing}
              onSelect={(e) => {
                e.preventDefault();
                if (!trip.isAgentProcessing) setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {trip.isAgentProcessing ? "Processing…" : t("trip.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirm Delete Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("trip.deleteConfirmTitle").replace(
                "{name}",
                getLocalizedTripTitle(trip.title, t),
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("trip.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("security.btnCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTrip(trip._id);
                setConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("trip.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
