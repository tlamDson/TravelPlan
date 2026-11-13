/**
 * Highlights section. Holds no testimonials until real, attributable ones exist.
 */

import { useTranslationStore } from "@/stores/useTranslationStore";
import { WHY_TRAVELPLAN } from "../constants";

export function TestimonialsSection() {
  const t = useTranslationStore((state) => state.t);
  return (
    <section className="py-20 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("landing.highlights.title")}
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {WHY_TRAVELPLAN.map((item) => (
            <div
              key={item.key}
              className="p-6 rounded-2xl bg-card border border-border"
            >
              <h3 className="font-medium mb-2">
                {t(`landing.highlights.${item.key}.title`)}
              </h3>
              <p className="text-muted-foreground">
                {t(`landing.highlights.${item.key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
