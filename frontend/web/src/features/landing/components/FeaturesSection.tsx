/**
 * Features Section Component
 */

import { useTranslationStore } from "@/stores/useTranslationStore";
import { FEATURES } from "../constants";

export function FeaturesSection() {
  const t = useTranslationStore((state) => state.t);
  return (
    <section className="py-20 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("landing.features.title")}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("landing.features.subtitle")}
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map((feature) => (
            <div
              key={feature.key}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {t(`landing.features.${feature.key}.title`)}
              </h3>
              <p className="text-muted-foreground">
                {t(`landing.features.${feature.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
