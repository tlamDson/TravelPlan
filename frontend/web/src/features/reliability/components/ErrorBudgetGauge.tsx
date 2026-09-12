import type { ErrorBudget, SliResult } from "@travelplan/shared";
import {
  ERROR_BUDGET_WARNING_RATIO,
  ERROR_BUDGET_CRITICAL_RATIO,
} from "@travelplan/shared";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTranslationStore } from "@/stores/useTranslationStore";

interface ErrorBudgetGaugeProps {
  sli: SliResult;
  errorBudget: ErrorBudget;
}

type BudgetStatus = "healthy" | "warning" | "critical";

/**
 * consumedRatio > 1 already means the SLO is missed this window (see
 * errorBudgetSchema's doc comment) — that's "critical". The warning
 * ratio is a conventional early-warning line: 3/4 of the budget gone
 * with the window still open is worth surfacing before it's fully
 * burned. Thresholds live in packages/shared so the measurement
 * tooling in backend/scripts can classify a reading exactly the way
 * this dashboard does, instead of duplicating the literals.
 */
function statusFromConsumedRatio(consumedRatio: number): BudgetStatus {
  if (consumedRatio >= ERROR_BUDGET_CRITICAL_RATIO) return "critical";
  if (consumedRatio >= ERROR_BUDGET_WARNING_RATIO) return "warning";
  return "healthy";
}

const STATUS_ICON: Record<BudgetStatus, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
};

export function ErrorBudgetGauge({ sli, errorBudget }: ErrorBudgetGaugeProps) {
  const { t } = useTranslationStore();

  if (sli.insufficientData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("reliability.errorBudget.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">
            {t("reliability.insufficientDataTitle")}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("reliability.insufficientDataMessage")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const status = statusFromConsumedRatio(errorBudget.consumedRatio);
  const Icon = STATUS_ICON[status];
  const remainingPercent =
    errorBudget.budgetTotal > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (errorBudget.budgetRemaining / errorBudget.budgetTotal) * 100,
          ),
        )
      : 0;
  const statusTextClass =
    status === "critical"
      ? "text-destructive"
      : status === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-green-600 dark:text-green-400";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reliability.errorBudget.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center gap-2 font-medium ${statusTextClass}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span>
            {t(`reliability.errorBudget.status${capitalize(status)}`)}
          </span>
        </div>

        <div>
          <div className="flex justify-between text-sm text-muted-foreground mb-1">
            <span>{t("reliability.errorBudget.remaining")}</span>
            <span>{remainingPercent.toFixed(0)}%</span>
          </div>
          <Progress value={remainingPercent} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">
            {t("reliability.errorBudget.consumed")}
          </dt>
          <dd className="text-right">
            {(errorBudget.consumedRatio * 100).toFixed(0)}%
          </dd>

          <dt className="text-muted-foreground">
            {t("reliability.errorBudget.burnRate")}
          </dt>
          <dd className="text-right">{errorBudget.burnRate.toFixed(2)}x</dd>

          <dt className="text-muted-foreground">
            {t("reliability.errorBudget.exhaustsAt")}
          </dt>
          <dd className="text-right">
            {errorBudget.exhaustsAt
              ? new Date(errorBudget.exhaustsAt).toLocaleDateString()
              : t("reliability.errorBudget.exhaustsNever")}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
