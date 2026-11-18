/**
 * Sign Up Benefits Panel Component
 *
 * Left side decorative panel showing product benefits
 */

import { Plane, Check } from "lucide-react";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { SIGN_UP_BENEFITS } from "../constants";

export function SignUpBenefitsPanel() {
  const t = useTranslationStore((state) => state.t);
  return (
    <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-primary/20 via-primary/10 to-background relative overflow-hidden flex-col justify-center p-12">
      <div className="max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <Plane className="h-8 w-8 text-primary" />
          <span className="font-bold text-2xl">TravelPlan</span>
        </div>
        <h2 className="text-3xl font-bold mb-4">
          {t("auth.signUp.panelTitle")}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t("auth.signUp.panelBody")}
        </p>
        <ul className="space-y-4">
          {SIGN_UP_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <span>{t(benefit)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
