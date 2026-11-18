/**
 * Landing Page Navigation Component
 */

import { Link } from "react-router-dom";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslationStore } from "@/stores/useTranslationStore";

export function LandingNav() {
  const { t } = useTranslationStore();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Plane className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">TravelPlan</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/signin">
            <Button variant="ghost">{t("landing.nav.signIn")}</Button>
          </Link>
          <Link to="/signup">
            <Button>{t("landing.nav.getStarted")}</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
