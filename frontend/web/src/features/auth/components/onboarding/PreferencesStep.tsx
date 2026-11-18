/**
 * Preferences Step Component
 *
 * Step 2: Interests and travel style selection
 */

import { Label } from "@/components/ui/label";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { INTERESTS, TRAVEL_STYLES } from "../../constants/onboarding";

interface PreferencesStepProps {
  selectedInterests: string[];
  travelStyle: string;
  onToggleInterest: (id: string) => void;
  onTravelStyleChange: (style: string) => void;
}

export function PreferencesStep({
  selectedInterests,
  travelStyle,
  onToggleInterest,
  onTravelStyleChange,
}: PreferencesStepProps) {
  const t = useTranslationStore((state) => state.t);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">
          {t("onboarding.prefs.title")}
        </h2>
        <p className="text-muted-foreground">
          {t("onboarding.prefs.subtitle")}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>{t("onboarding.prefs.interests")}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INTERESTS.map((interest) => (
              <button
                key={interest.id}
                type="button"
                onClick={() => onToggleInterest(interest.id)}
                aria-pressed={selectedInterests.includes(interest.id)}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  selectedInterests.includes(interest.id)
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl block mb-1">{interest.emoji}</span>
                <span className="text-sm font-medium">{t(`onboarding.interest.${interest.id}`)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("onboarding.prefs.travelStyle")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {TRAVEL_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => onTravelStyleChange(style.id)}
                aria-pressed={travelStyle === style.id}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  travelStyle === style.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="font-medium block">{t(`onboarding.style.${style.id}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`onboarding.style.${style.id}.desc`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
