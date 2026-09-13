import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTripWizardStore } from "@/stores/trip-wizard.store";
import { StepBasics } from "./wizard/StepBasics";
import { StepBudget } from "./wizard/StepBudget";
import { StepAccommodation } from "./wizard/StepAccommodation";
import { StepTransport } from "./wizard/StepTransport";
import { StepActivities } from "./wizard/StepActivities";
import { StepRequirements } from "./wizard/StepRequirements";
import { useTripWizard } from "../hooks/useTripWizard";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { useActiveJobStore } from "@/stores/useActiveJobStore";
import { getUserPreferences } from "@/features/settings/types/user-preferences.types";
import { getTripDays, buildPreferences } from "./create-trip-dialog.utils";
import { BRAND_GRADIENT_BUTTON } from "@/lib/brandGradient";

const TOTAL_STEPS = 6;
const MIN_DAILY_BUDGET = 20;

const steps = [
  { titleKey: "wizard.step1Title", descKey: "wizard.step1Desc" },
  { titleKey: "wizard.step2Title", descKey: "wizard.step2Desc" },
  { titleKey: "wizard.step3Title", descKey: "wizard.step3Desc" },
  { titleKey: "wizard.step4Title", descKey: "wizard.step4Desc" },
  { titleKey: "wizard.step5Title", descKey: "wizard.step5Desc" },
  { titleKey: "wizard.step6Title", descKey: "wizard.step6Desc" },
];

export function CreateTripDialog({ trigger }: { trigger: React.ReactNode }) {
  const navigate = useNavigate();
  const { data, reset, initWizard } = useTripWizardStore();
  const { t, language, currency: preferredCurrency } = useTranslationStore();
  const { isPro, openUpgradeModal } = useSubscriptionStore();
  const { setActiveJob } = useActiveJobStore();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const { mutate, isPending } = useTripWizard({
    onSuccess: (tripId, jobId) => {
      setActiveJob(jobId, tripId);
      setOpen(false);
      reset();
      setStepIndex(0);
      navigate(`/trips/${tripId}`);
    },
  });

  const stepMeta = steps[stepIndex];
  const progressValue = ((stepIndex + 1) / TOTAL_STEPS) * 100;
  const selectedTripDays = getTripDays(data.startDate, data.endDate) ?? 0;
  const isTripOverFreeCap = !isPro && selectedTripDays > 5;

  const stepValid = useMemo(() => {
    const tripDays = getTripDays(data.startDate, data.endDate);
    const totalTravelers =
      data.travelers.adults + data.travelers.children * 0.5;
    const budgetPerPersonDay =
      tripDays && totalTravelers > 0
        ? data.budget.total / (tripDays * totalTravelers)
        : null;

    if (stepIndex === 0) {
      return (
        data.title.trim().length >= 2 &&
        data.destination.trim().length >= 2 &&
        tripDays !== null &&
        data.travelers.adults >= 1
      );
    }

    if (stepIndex === 1) {
      return (
        budgetPerPersonDay !== null && budgetPerPersonDay >= MIN_DAILY_BUDGET
      );
    }

    if (stepIndex === 2) {
      return data.accommodationType !== "";
    }

    if (stepIndex === 3) {
      return !!data.transportMode;
    }

    if (stepIndex === 4) {
      // Pace + at least 1 focus selected
      return !!data.pace && data.focus.length > 0;
    }

    if (stepIndex === 5) {
      // Special requirements step is always optional — always valid
      return true;
    }

    return false;
  }, [data, stepIndex]);

  const handleNext = () => {
    if (stepIndex === 0 && isTripOverFreeCap) {
      openUpgradeModal("trip-duration");
      return;
    }
    if (stepIndex < TOTAL_STEPS - 1) {
      setStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    const preferences = buildPreferences(data);
    const title = data.title.trim();

    mutate({ preferences, language, title });
  };

  const renderStep = () => {
    if (stepIndex === 0) return <StepBasics />;
    if (stepIndex === 1) return <StepBudget />;
    if (stepIndex === 2) return <StepAccommodation />;
    if (stepIndex === 3) return <StepTransport />;
    if (stepIndex === 4) return <StepActivities />;
    return <StepRequirements />;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          // Sync budget currency with user's preferred currency setting
          initWizard(preferredCurrency || "USD", getUserPreferences());
        } else {
          reset();
          setStepIndex(0);
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-2xl"
        data-testid="trip-wizard"
        data-step={stepIndex}
      >
        <DialogHeader>
          <DialogTitle>{t(stepMeta.titleKey)}</DialogTitle>
          <DialogDescription>{t(stepMeta.descKey)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Progress value={progressValue} />
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="trip-wizard-step-indicator"
            >
              {t("wizard.step")} {stepIndex + 1} {t("wizard.of")} {TOTAL_STEPS}
            </p>
          </div>
          {renderStep()}
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            data-testid="trip-wizard-reset"
            onClick={() => {
              reset();
              setStepIndex(0);
            }}
          >
            {t("wizard.btnReset")}
          </Button>
          <Button
            variant="ghost"
            data-testid="trip-wizard-back"
            onClick={handleBack}
            disabled={stepIndex === 0}
          >
            {t("wizard.btnBack")}
          </Button>
          {stepIndex < TOTAL_STEPS - 1 ? (
            <Button
              data-testid="trip-wizard-next"
              onClick={handleNext}
              disabled={!stepValid}
              className={
                stepIndex === 0 && isTripOverFreeCap
                  ? BRAND_GRADIENT_BUTTON
                  : ""
              }
            >
              {stepIndex === 0 && isTripOverFreeCap
                ? "\u2728 Upgrade to Continue"
                : t("wizard.btnNext")}
            </Button>
          ) : (
            <Button
              data-testid="trip-wizard-create"
              onClick={handleSubmit}
              disabled={!stepValid || isPending}
            >
              {isPending ? t("wizard.btnCreating") : t("wizard.btnCreate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
