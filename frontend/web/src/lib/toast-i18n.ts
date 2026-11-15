import {
  TRANSLATIONS,
  useTranslationStore,
} from "@/stores/useTranslationStore";

/**
 * Text for a toast in the language the UI is in *now* (read when the toast
 * fires, so mutation callbacks follow a locale switch). `{name}` placeholders
 * are filled from `vars`.
 */
export function toastT(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const text = useTranslationStore.getState().t(key);
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Like `toastT`, for text keyed by a server/Clerk error code: uses `key` when
 * the dictionary knows it, otherwise the translated `fallbackKey`. Raw
 * server or Clerk text (English only) is never shown in a toast.
 */
export function toastTOr(key: string, fallbackKey: string): string {
  return toastT(key in TRANSLATIONS["English (US)"] ? key : fallbackKey);
}
