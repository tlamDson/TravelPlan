/**
 * DatePicker
 *
 * Reusable single-date picker.
 * Uses the same react-day-picker v9 + date-range-picker.css theming
 * as DateRangePicker so both pickers look identical.
 *
 * Responsive:
 *  - Mobile (<640px): 1 month in popover, full-width trigger
 *  - Desktop: popover aligns to the trigger, fixed width
 *
 * Accessible:
 *  - keyboard nav (react-day-picker built-in)
 *  - aria-label on trigger
 *  - focus ring on all interactive elements
 */

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslationStore } from "@/stores/useTranslationStore";
import { getDateFnsLocale } from "@/utils/locale";
import "@/styles/calendar.css";

// ─── Types ────────────────────────────────────────────────

export interface DatePickerProps {
  /** ISO date string "YYYY-MM-DD" or empty string */
  value: string;
  /** Called with the selected ISO date string */
  onChange: (date: string) => void;
  /** Earliest selectable date */
  minDate?: Date;
  /** Latest selectable date */
  maxDate?: Date;
  /** Placeholder shown when no date is selected */
  placeholder?: string;
  /** Optional extra class on the trigger button */
  className?: string;
  /** aria-label for the trigger button */
  ariaLabel?: string;
  /** data-testid for the trigger button */
  testId?: string;
}

// ─── Helper ───────────────────────────────────────────────

function toDate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Component ────────────────────────────────────────────

export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Select date",
  className,
  ariaLabel,
  testId,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const language = useTranslationStore((state) => state.language);
  const t = useTranslationStore((state) => state.t);
  const locale = getDateFnsLocale(language);

  const selected = toDate(value);
  const today = minDate ?? new Date();
  today.setHours(0, 0, 0, 0);

  const label = selected ? format(selected, "PP", { locale }) : "";

  const handleSelect = (day: Date | undefined) => {
    if (!day) return;
    const isoDate = format(day, "yyyy-MM-dd");
    onChange(isoDate);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-testid={testId}
          className={cn(
            "w-full justify-start text-left font-normal h-10 px-3",
            !label && "text-muted-foreground",
            className,
          )}
          aria-label={ariaLabel ?? (label || placeholder)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">{label || placeholder}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-3" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          disabled={[
            { before: today },
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          defaultMonth={selected ?? today}
          showOutsideDays
          locale={locale}
          labels={{
            labelDayButton: (date, modifiers) => {
              let text = format(date, "PPPP", { locale });
              if (modifiers.today) {
                text = `${t("wizard.calendarToday")}, ${text}`;
              }
              if (modifiers.selected) {
                text = `${text}, ${t("wizard.calendarSelected")}`;
              }
              return text;
            },
            labelNext: () => t("wizard.calendarNextMonth"),
            labelPrevious: () => t("wizard.calendarPrevMonth"),
          }}
          className="rdp-root"
        />
        {/* Clear button */}
        {selected && (
          <div className="flex justify-end border-t border-border pt-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("wizard.clearDate")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
