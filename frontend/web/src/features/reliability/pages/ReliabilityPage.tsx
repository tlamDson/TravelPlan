import { Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { WidgetError } from "@/components/WidgetError";
import { useSloReport } from "../hooks/useSloReport";
import { ErrorBudgetGauge } from "../components/ErrorBudgetGauge";
import { LatencyChart } from "../components/LatencyChart";
import { GoldenSignalsGrid } from "../components/GoldenSignalsGrid";

export default function ReliabilityPage() {
  const { t } = useTranslationStore();
  const { data, isLoading, error, refetch } = useSloReport();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">{t("reliability.pageTitle")}</h1>
          <p className="text-muted-foreground">
            {t("reliability.pageSubtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-8 w-8 animate-spin text-primary"
              aria-hidden="true"
            />
            <span className="sr-only">{t("reliability.loading")}</span>
          </div>
        ) : error || !data ? (
          <WidgetError
            title={t("reliability.errorTitle")}
            message={
              error instanceof Error
                ? error.message
                : t("reliability.errorMessage")
            }
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            {/* Compliance window (28d) is the headline number — fast/slow-burn
                windows are for the burn-rate math, not shown as their own
                gauges here to keep this page's first read simple. */}
            <ErrorBudgetGauge
              sli={data.windows.compliance.sli}
              errorBudget={data.windows.compliance.errorBudget}
            />
            <LatencyChart
              queueWaitMs={data.signals.latency.queueWaitMs}
              processingMs={data.signals.latency.processingMs}
              endToEndMs={data.signals.latency.endToEndMs}
            />
            <GoldenSignalsGrid signals={data.signals} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
