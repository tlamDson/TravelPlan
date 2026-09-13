import { useTranslationStore } from "@/stores/useTranslationStore";
import {
  useSubscriptionStore,
  subscriptionLimits,
} from "@/stores/useSubscriptionStore";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

export function SubscriptionSettings() {
  const { t } = useTranslationStore();
  const {
    isPro,
    tripsUsedThisCycle,
    tripLimit,
    quotaResetsAt,
    openUpgradeModal,
  } = useSubscriptionStore();

  const maxTrips =
    tripLimit > 0 ? tripLimit : subscriptionLimits.FREE_TRIP_LIMIT;
  const usagePercentage = Math.min(100, (tripsUsedThisCycle / maxTrips) * 100);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">
          {t("sub.pageTitle")}
        </h3>
        <p className="text-muted-foreground mt-1">{t("sub.pageSubtitle")}</p>
      </div>

      <Separator />

      {/* Current Plan Card */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">
          {t("sub.currentPlan")}
        </h4>
        <div
          className={`p-6 rounded-xl border ${isPro ? "bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border-indigo-200 dark:border-indigo-800" : "bg-card"}`}
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">
                  {isPro ? t("sub.proPlan") : t("sub.freePlan")}
                </span>
                {isPro && (
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    {t("sub.proBadge")}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                {isPro ? t("sub.proLimitsDesc") : t("sub.freeLimitsDesc")}
              </p>

              {isPro && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2
                      className={`w-4 h-4 ${STATUS_TONE_STYLES.success.textClassName}`}
                    />
                    <span>Generate up to 30 days per trip</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2
                      className={`w-4 h-4 ${STATUS_TONE_STYLES.success.textClassName}`}
                    />
                    <span>Priority generation queue</span>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-start md:items-end gap-3">
              {!isPro ? (
                <Button
                  onClick={() => openUpgradeModal("general-upgrade")}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-md transition-all hover:shadow-lg w-full md:w-auto"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  {t("sub.upgradeButton")}
                </Button>
              ) : (
                <Button variant="outline" className="w-full md:w-auto">
                  {t("sub.manageButton")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Usage Progress */}
      <section className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">
          {t("sub.usageTitle")}
        </h4>
        <div className="p-5 rounded-lg border bg-card/50 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t("sub.tripsUsed")}</span>
            <span className="text-muted-foreground font-mono">
              {tripsUsedThisCycle} / {isPro ? t("sub.unlimited") : maxTrips}
            </span>
          </div>

          <Progress
            value={isPro ? 0 : usagePercentage}
            className={`h-2 ${!isPro && usagePercentage >= 100 ? "bg-tag-red" : ""}`}
          />

          {quotaResetsAt && !isPro && (
            <p className="text-xs text-muted-foreground flex justify-between items-center">
              <span>{t("sub.resetsAt")}</span>
              <span className="font-medium">
                {format(new Date(quotaResetsAt), "MMM dd, yyyy")}
              </span>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
