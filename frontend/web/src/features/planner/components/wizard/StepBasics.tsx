import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTripWizardStore } from "@/stores/trip-wizard.store";
import { DatePicker } from "./DatePicker";
import { addDays } from "date-fns";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { useSubscriptionStore } from "@/stores/useSubscriptionStore";
import { WizardDestinationPickers } from "./WizardDestinationPickers";

export function StepBasics() {
  const { data, setData, setTravelers } = useTripWizardStore();
  const { t } = useTranslationStore();
  const { isPro } = useSubscriptionStore();

  const start = useMemo(
    () => (data.startDate ? new Date(data.startDate) : null),
    [data.startDate],
  );
  const end = useMemo(
    () => (data.endDate ? new Date(data.endDate) : null),
    [data.endDate],
  );
  const dateError = start && end && end <= start ? t("wizard.dateError") : null;
  const tripDays = useMemo(() => {
    if (!start || !end || end <= start) return 0;
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [start, end]);
  const isAtFreeCap = !isPro && tripDays === 5;
  const isOverFreeCap = !isPro && tripDays > 5;

  const updateTravelers = (key: "adults" | "children", delta: number) => {
    const nextValue = Math.max(
      key === "adults" ? 1 : 0,
      data.travelers[key] + delta,
    );
    setTravelers({ ...data.travelers, [key]: nextValue });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">{t("wizard.title")}</Label>
        <Input
          id="title"
          data-testid="trip-wizard-title"
          placeholder={t("wizard.titlePlaceholder")}
          value={data.title}
          onChange={(e) => setData({ title: e.target.value })}
        />
        {data.title.trim().length > 0 && data.title.trim().length < 2 && (
          <p className="text-sm text-destructive">{t("wizard.titleError")}</p>
        )}
      </div>

      <WizardDestinationPickers />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startDate">{t("wizard.startDate")}</Label>
          <DatePicker
            value={data.startDate}
            onChange={(date) => setData({ startDate: date })}
            placeholder={t("wizard.pickStartDate")}
            ariaLabel={t("wizard.startDate")}
            testId="trip-wizard-start-date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">{t("wizard.endDate")}</Label>
          <DatePicker
            value={data.endDate}
            onChange={(date) => setData({ endDate: date })}
            placeholder={t("wizard.pickEndDate")}
            ariaLabel={t("wizard.endDate")}
            testId="trip-wizard-end-date"
            minDate={
              data.startDate
                ? addDays(new Date(data.startDate + "T00:00:00"), 1)
                : undefined
            }
          />
        </div>
      </div>
      {dateError && <p className="text-sm text-destructive">{dateError}</p>}
      {!dateError && isAtFreeCap && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          {
            "\u{1F4A1} You're at the Free plan maximum (5 days). Upgrade to Pro for longer trips."
          }
        </div>
      )}
      {!dateError && isOverFreeCap && (
        <div className="rounded-md border border-purple-300 bg-gradient-to-r from-purple-50 to-orange-50 p-3 text-sm text-purple-800">
          {`\u2728 ${tripDays}-day itineraries are available on Pro (up to 30 days).`}
        </div>
      )}

      <div className="space-y-2">
        <Label>{t("wizard.travelers")}</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="font-medium">{t("wizard.adults")}</p>
              <p className="text-xs text-muted-foreground">
                {t("wizard.adultsAge")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                data-testid="trip-wizard-adults-decrease"
                onClick={() => updateTravelers("adults", -1)}
                aria-label="Decrease adults"
              >
                -
              </Button>
              <span
                className="w-6 text-center font-medium"
                data-testid="trip-wizard-adults-value"
              >
                {data.travelers.adults}
              </span>
              <Button
                variant="outline"
                size="icon"
                data-testid="trip-wizard-adults-increase"
                onClick={() => updateTravelers("adults", 1)}
                aria-label="Increase adults"
              >
                +
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="font-medium">{t("wizard.children")}</p>
              <p className="text-xs text-muted-foreground">
                {t("wizard.childrenAge")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                data-testid="trip-wizard-children-decrease"
                onClick={() => updateTravelers("children", -1)}
                aria-label="Decrease children"
              >
                -
              </Button>
              <span
                className="w-6 text-center font-medium"
                data-testid="trip-wizard-children-value"
              >
                {data.travelers.children}
              </span>
              <Button
                variant="outline"
                size="icon"
                data-testid="trip-wizard-children-increase"
                onClick={() => updateTravelers("children", 1)}
                aria-label="Increase children"
              >
                +
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
