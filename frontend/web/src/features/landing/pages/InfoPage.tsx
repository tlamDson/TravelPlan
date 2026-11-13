/**
 * Public info page (About / Privacy / Terms) driven by INFO_PAGES copy.
 */

import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LandingFooter, LandingNav } from "../components";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { INFO_PAGES, type InfoPageKey } from "../constants/info-pages";

export default function InfoPage({ page }: { page: InfoPageKey }) {
  const { t } = useTranslationStore();
  const { title, intro, sections } = INFO_PAGES[page];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <LandingNav />
      <main className="flex-1 container mx-auto px-4 pt-28 pb-16 max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("landing.info.backHome")}
        </Link>
        <h1 className="text-3xl font-bold mb-4">{t(title)}</h1>
        <p className="text-muted-foreground mb-8">{t(intro)}</p>
        {sections.map((section) => (
          <section key={section.heading} className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{t(section.heading)}</h2>
            <p className="text-muted-foreground">{t(section.body)}</p>
          </section>
        ))}
      </main>
      <LandingFooter />
    </div>
  );
}
