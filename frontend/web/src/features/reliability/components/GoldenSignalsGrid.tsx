import type { GoldenSignals } from "@travelplan/shared";
import { Activity, AlertOctagon, Gauge, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { STATUS_TONE_STYLES } from "@/features/planner/lib/statusStyles";

interface GoldenSignalsGridProps {
  signals: GoldenSignals;
}

function formatRate(rate: number | null, t: (key: string) => string): string {
  return rate === null
    ? t("reliability.signals.notAvailable")
    : `${(rate * 100).toFixed(1)}%`;
}

export function GoldenSignalsGrid({ signals }: GoldenSignalsGridProps) {
  const { t } = useTranslationStore();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("reliability.signals.latencyTitle")}
          </CardTitle>
          <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {(signals.latency.endToEndMs.p95 / 1000).toFixed(1)}s
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("reliability.signals.latencyDef")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("reliability.signals.trafficTitle")}
          </CardTitle>
          <TrendingUp
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {signals.traffic.jobsPerHour.toFixed(1)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {t("reliability.signals.jobsPerHour")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("reliability.signals.trafficDef")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("reliability.signals.errorsTitle")}
          </CardTitle>
          <AlertOctagon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("reliability.signals.fallbackRate")}
            </span>
            <span>{formatRate(signals.errors.fallbackRate, t)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("reliability.signals.failureRate")}
            </span>
            <span>{formatRate(signals.errors.failureRate, t)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("reliability.signals.errorsDef")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("reliability.signals.saturationTitle")}
          </CardTitle>
          <Activity
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </CardHeader>
        <CardContent className="space-y-1">
          <div
            className={`text-sm font-medium ${
              signals.saturation.workerAlive
                ? STATUS_TONE_STYLES.success.textClassName
                : STATUS_TONE_STYLES.danger.textClassName
            }`}
          >
            {signals.saturation.workerAlive
              ? t("reliability.signals.workerAlive")
              : t("reliability.signals.workerDown")}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("reliability.signals.stalledCount")}
            </span>
            <span>{signals.saturation.stalledCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("reliability.signals.saturationDef")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
