/**
 * CTA Section Component
 */

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslationStore } from "@/stores/useTranslationStore";

export function CTASection() {
  const t = useTranslationStore((state) => state.t);
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t("landing.cta.title")}
          </h2>
          <p className="text-muted-foreground mb-8">
            {t("landing.cta.subtitle")}
          </p>
          <Link to="/signup">
            <Button size="lg">
              {t("landing.cta.getStarted")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
