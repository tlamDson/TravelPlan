import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/format";
import type { ItineraryDay } from "@/utils/schemas";
import type { Language } from "@/stores/useTranslationStore";
import { useTranslationStore } from "@/stores/useTranslationStore";

interface TripDetailDayStripProps {
  sortedDays: ItineraryDay[];
  activeIndex: number;
  onSelectDay: (index: number) => void;
  language: Language;
}

export function TripDetailDayStrip({
  sortedDays,
  activeIndex,
  onSelectDay,
  language,
}: TripDetailDayStripProps) {
  const { t } = useTranslationStore();
  if (sortedDays.length === 0) return null;

  return (
    <nav
      aria-label={t("trip.dayNavigation")}
      className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/80 backdrop-blur-md border-b border-border/60"
    >
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:thin]">
        {sortedDays.map((day, idx) => {
          let shortDate = "";
          try {
            const dateOnly = day.date.slice(0, 10);
            const [y, m, d] = dateOnly.split("-").map(Number);
            const localDate = new Date(y!, m! - 1, d!);
            shortDate = formatDate(localDate, language, {
              month: "short",
              day: "numeric",
            });
          } catch {
            shortDate = "";
          }

          const selected = idx === activeIndex;

          return (
            <button
              key={day._id ?? `day-${day.day}`}
              type="button"
              data-testid={`trip-detail-day-tab-${day.day}`}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelectDay(idx)}
              className={cn(
                "shrink-0 snap-start min-h-10 px-3 py-2 rounded-lg border text-left text-sm font-medium cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="block text-xs font-semibold uppercase tracking-wide opacity-90">
                {t("trip.dayLabel").replace("{n}", String(day.day))}
              </span>
              {shortDate ? (
                <span className="block text-xs font-normal opacity-90">
                  {shortDate}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
