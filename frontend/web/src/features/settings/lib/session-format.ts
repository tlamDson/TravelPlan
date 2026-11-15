import { formatDate, getLocaleCode } from "@/utils/format";
import type { Language } from "@/stores/useTranslationStore";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ABSOLUTE_AFTER_DAYS = 30;

/**
 * "2 giờ trước" / "yesterday" / "il y a 3 minutes" in the UI language;
 * a plain date once the activity is older than 30 days.
 */
export function formatLastActive(
  at: Date | number,
  now: Date | number,
  lang: Language,
): string {
  const then = new Date(at).getTime();
  const elapsed = Math.max(0, new Date(now).getTime() - then);
  const rtf = new Intl.RelativeTimeFormat(getLocaleCode(lang), {
    numeric: "auto",
  });

  if (elapsed < MINUTE) return rtf.format(0, "second");
  if (elapsed < HOUR)
    return rtf.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return rtf.format(-Math.floor(elapsed / HOUR), "hour");
  const days = Math.floor(elapsed / DAY);
  if (days <= ABSOLUTE_AFTER_DAYS) return rtf.format(-days, "day");
  return formatDate(new Date(then), lang);
}
