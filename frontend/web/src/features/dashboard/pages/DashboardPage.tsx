import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WidgetError } from "@/components/WidgetError";
import { useTrips } from "@/features/planner/hooks/useTrips";
import { TripCard } from "@/features/planner/components/TripCard";
import {
  Plus,
  Plane,
  MapPin,
  CreditCard,
  Users,
  Loader2,
  Zap,
} from "lucide-react";
import { CreateTripDialog } from "@/features/planner/components";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { getUserMe, type UserProfile } from "@/features/user/api/user.api";
import { apiClient } from "@/lib/axios";
import { toast } from "sonner";
import {
  BRAND_GRADIENT_BADGE,
  BRAND_GRADIENT_BUTTON,
} from "@/lib/brandGradient";

export default function DashboardPage() {
  const { data: trips, isLoading, error } = useTrips();
  const { t } = useTranslationStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showConfetti, setShowConfetti] = useState(false);
  const { canCreateTrip, openUpgradeModal, isPro } = useSubscriptionStore();
  const { setSubscriptionSnapshot, closeUpgradeModal } = useSubscriptionStore();
  const blockedByFreeLimit = !isPro && !canCreateTrip();

  useEffect(() => {
    const success = searchParams.get("success") === "true";
    const canceled = searchParams.get("canceled") === "true";
    if (!success && !canceled) return;

    if (canceled) {
      toast.info("Upgrade canceled. You are still on the Free plan.");
      searchParams.delete("canceled");
      setSearchParams(searchParams, { replace: true });
      return;
    }

    const syncAfterCheckout = async () => {
      try {
        const user: UserProfile = await getUserMe();
        const usage = user.usage;
        setSubscriptionSnapshot({
          isPro: user.tier === "pro",
          tripsUsedThisCycle: usage?.tripsUsedThisCycle ?? 0,
          tripLimit: usage?.tripLimit ?? 10,
          quotaResetsAt: usage?.quotaResetsAt ?? null,
        });
        closeUpgradeModal();
        setShowConfetti(true);
        toast.success(
          "Welcome to TravelPlan Pro! Your limits have been removed.",
        );
        window.setTimeout(() => setShowConfetti(false), 3000);
      } catch {
        toast.info("Upgrade processed. Refreshing your subscription status...");
      } finally {
        searchParams.delete("success");
        setSearchParams(searchParams, { replace: true });
      }
    };
    void syncAfterCheckout();
  }, [
    searchParams,
    setSearchParams,
    closeUpgradeModal,
    setSubscriptionSnapshot,
  ]);

  // Computed Metrics
  const totalPlaces =
    trips?.reduce((acc, trip) => acc + (trip.cities?.length || 0), 0) || 0;

  const totalSpent =
    trips?.reduce((acc, trip) => acc + (trip.budget?.totalSpent || 0), 0) || 0;

  const totalTravelers =
    trips?.reduce((acc, trip) => {
      switch (trip.groupType) {
        case "couple":
          return acc + 2;
        case "family_kids":
        case "friends":
          return acc + 4;
        case "solo":
        case "work":
        default:
          return acc + 1;
      }
    }, 0) || 0;

  const avgTravelers = trips?.length
    ? Math.round(totalTravelers / trips.length)
    : 0;

  return (
    <DashboardLayout>
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {Array.from({ length: 80 }).map((_, i) => (
            <span
              key={i}
              className={`absolute h-2 w-2 animate-bounce rounded-full ${BRAND_GRADIENT_BADGE}`}
              style={{
                left: `${(i * 13) % 100}%`,
                top: `${(i * 7) % 30}%`,
                animationDelay: `${(i % 10) * 60}ms`,
              }}
            />
          ))}
        </div>
      )}
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t("dash.welcome")}</h1>
            <p className="text-muted-foreground">{t("dash.subtitle")}</p>
          </div>
          {import.meta.env.MODE === "development" && (
            <Button
              variant="outline"
              className="border-dashed border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white mr-2"
              onClick={async () => {
                try {
                  await apiClient.post("/dev/toggle-pro");
                  toast.success("Toggled Pro mode! Reloading page...");
                  window.location.reload();
                } catch {
                  toast.error("Failed to toggle pro status");
                }
              }}
            >
              <Zap className="h-4 w-4 mr-2" />
              Dev: Toggle Pro
            </Button>
          )}

          {blockedByFreeLimit ? (
            <Button
              className={BRAND_GRADIENT_BUTTON}
              onClick={() => openUpgradeModal("monthly-trip-limit")}
            >
              ✨ Get Pro for Unlimited Trips
            </Button>
          ) : (
            <CreateTripDialog
              trigger={
                <Button data-testid="dashboard-new-trip-button">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("dash.planNew")}
                </Button>
              }
            />
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t("dash.totalPlaces")}
              </CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPlaces}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t("dash.budgetSpent")}
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(totalSpent)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {t("dash.avgTravelers")}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgTravelers}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Trips */}
        <ErrorBoundary
          fallback={
            <WidgetError
              title="Trips Unavailable"
              message="Failed to load your trips"
            />
          }
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("dash.recentTrips")}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/trips">{t("dash.viewAll")}</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : error ? (
                <WidgetError
                  title="Error"
                  message={error.message}
                  onRetry={() => window.location.reload()}
                />
              ) : trips?.length === 0 ? (
                <div className="text-center py-8">
                  <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">{t("dash.noTrips")}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("dash.startPlanning")}
                  </p>
                  <CreateTripDialog
                    trigger={
                      <Button data-testid="dashboard-empty-create-button">
                        <Plus className="h-4 w-4 mr-2" />
                        {t("dash.createTrip")}
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {trips?.slice(0, 6).map((trip, index) => (
                    <TripCard
                      key={trip._id}
                      trip={trip}
                      priority={index === 0}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
