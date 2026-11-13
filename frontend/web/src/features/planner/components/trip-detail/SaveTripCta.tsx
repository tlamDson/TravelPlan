import { Check } from "lucide-react";
import {
  SAVE_TRIP_CTA_EXPERIMENT_KEY,
  SAVE_TRIP_CTA_VARIANTS,
} from "@travelplan/shared";
import { Button } from "@/components/ui/button";
import { useExperiment } from "@/features/experiments";
import { useTranslationStore } from "@/stores/useTranslationStore";

interface SaveTripCtaProps {
  onSave: () => void;
  disabled: boolean;
}

/**
 * Save button of the trip-name editor, split by save-trip-cta-v1. Mounted
 * only while the editor is open, so the exposure fires when the CTA is
 * actually on screen. Anything but `labeled-cta` (no assignment, control,
 * holdout, unknown) renders the original icon-only button. The labeled
 * button's visible text is its accessible name (WCAG 2.5.3).
 */
export function SaveTripCta({ onSave, disabled }: SaveTripCtaProps) {
  const { t } = useTranslationStore();
  const { variant } = useExperiment(SAVE_TRIP_CTA_EXPERIMENT_KEY);
  const labeled = variant === SAVE_TRIP_CTA_VARIANTS.labeled;

  if (labeled) {
    return (
      <Button
        size="sm"
        className="h-8 gap-1.5 cursor-pointer transition-colors duration-200"
        onClick={onSave}
        disabled={disabled}
        data-variant={SAVE_TRIP_CTA_VARIANTS.labeled}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {t("trip.saveTripCta")}
      </Button>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer transition-colors duration-200"
      onClick={onSave}
      disabled={disabled}
      aria-label={t("trip.saveTitle")}
      data-variant={SAVE_TRIP_CTA_VARIANTS.control}
    >
      <Check className="h-4 w-4" />
    </Button>
  );
}
