/**
 * Trips Page
 *
 * Full trips list with filtering and sorting
 */

import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataError } from "@/components/DataError";
import { useTrips } from "@/features/planner/hooks/useTrips";
import { TripCard } from "@/features/planner/components/TripCard";
import { Plus, Search, Loader2 } from "lucide-react";
import { CreateTripDialog } from "@/features/planner/components";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { getLocalizedTripTitle } from "@/utils/format";
import {
  getStatusColor,
  type FilterStatus,
  type SortOption,
} from "./tripsPageFilters";

export default function TripsPage() {
  const { data: trips, isLoading, error, refetch } = useTrips();
  const { t } = useTranslationStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filteredTrips = useMemo(() => {
    const base =
      trips?.filter((trip) => {
        const localizedTitle = getLocalizedTripTitle(trip.title, t);
        const matchesSearch = localizedTitle
          .toLowerCase()
          .includes(search.toLowerCase());

        let matchesStatus = false;
        if (statusFilter === "all") {
          matchesStatus = true;
        } else if (statusFilter === "GENERATING") {
          matchesStatus =
            ["DRAFT", "QUEUED"].includes(trip.status) ||
            trip.status.startsWith("PROCESSING");
        } else if (statusFilter === "FAILED") {
          matchesStatus = trip.status === "FAILED";
        } else {
          // It's a lifecycle filter (UPCOMING, IN_TRIP, COMPLETED, CANCELLED)
          // We only match lifecycle if the AI is truly done (COMPLETED).
          const currentLifecycle = trip.lifecycle;
          matchesStatus =
            trip.status === "COMPLETED" && currentLifecycle === statusFilter;
        }

        return matchesSearch && matchesStatus;
      }) ?? [];

    return [...base].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "oldest":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case "az":
          return getLocalizedTripTitle(a.title, t)
            .toLowerCase()
            .localeCompare(getLocalizedTripTitle(b.title, t).toLowerCase());
        case "za":
          return getLocalizedTripTitle(b.title, t)
            .toLowerCase()
            .localeCompare(getLocalizedTripTitle(a.title, t).toLowerCase());
        default:
          return 0;
      }
    });
  }, [trips, search, statusFilter, sortBy, t]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t("trips.pageTitle")}</h1>
            <p className="text-muted-foreground">{t("trips.pageSubtitle")}</p>
          </div>
          <CreateTripDialog
            trigger={
              <Button data-testid="trips-new-trip-button">
                <Plus className="h-4 w-4 mr-2" />
                {t("trips.newTrip")}
              </Button>
            }
          />
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("trips.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as FilterStatus)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder={t("trips.filterPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className={getStatusColor("all")} value="all">
                {t("trips.filterAll")}
              </SelectItem>
              <SelectItem
                className={getStatusColor("UPCOMING")}
                value="UPCOMING"
              >
                {t("trip.lifecycle_upcoming")}
              </SelectItem>
              <SelectItem className={getStatusColor("IN_TRIP")} value="IN_TRIP">
                {t("trip.lifecycle_in_trip")}
              </SelectItem>
              <SelectItem
                className={getStatusColor("COMPLETED")}
                value="COMPLETED"
              >
                {t("trip.lifecycle_completed")}
              </SelectItem>
              <SelectItem
                className={getStatusColor("CANCELLED")}
                value="CANCELLED"
              >
                {t("trip.lifecycle_cancelled")}
              </SelectItem>
              <SelectItem
                className={getStatusColor("GENERATING")}
                value="GENERATING"
              >
                {t("trips.filterGenerating")}
              </SelectItem>
              <SelectItem className={getStatusColor("FAILED")} value="FAILED">
                {t("trips.filterFailed")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder={t("trips.sortPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className={getStatusColor("sort")} value="newest">
                {t("trips.sortNewest")}
              </SelectItem>
              <SelectItem className={getStatusColor("sort")} value="oldest">
                {t("trips.sortOldest")}
              </SelectItem>
              <SelectItem className={getStatusColor("sort")} value="az">
                {t("trips.sortAZ")}
              </SelectItem>
              <SelectItem className={getStatusColor("sort")} value="za">
                {t("trips.sortZA")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trip List */}
        <ErrorBoundary>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <DataError
              title={t("trips.errorLoad")}
              message={error.message}
              onRetry={() => refetch()}
            />
          ) : filteredTrips.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {search || statusFilter !== "all"
                  ? t("trips.emptyFilter")
                  : t("trips.emptyAll")}
              </p>
              {!search && statusFilter === "all" && (
                <CreateTripDialog
                  trigger={
                    <Button data-testid="trips-empty-create-button">
                      <Plus className="h-4 w-4 mr-2" />
                      {t("trips.createFirst")}
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTrips.map((trip, index) => (
                <TripCard key={trip._id} trip={trip} priority={index === 0} />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
