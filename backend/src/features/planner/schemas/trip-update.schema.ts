import { z } from "zod";
import sanitizeHtml from "sanitize-html";

export const TRIP_TITLE_MAX = 200;
export const TRIP_DESCRIPTION_MAX = 2000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};

/**
 * sanitize-html returns HTML, so it escapes & < > " in text. These fields are
 * plain text (React escapes them on render), so decode those four entities
 * back or "Tom & Jerry" would be stored as "Tom &amp; Jerry". Decoding can
 * reveal markup that was entity-encoded in the input, so repeat until stable.
 */
const stripHtml = (value: string): string => {
  let current = value;
  for (let i = 0; i < 3; i++) {
    const next = sanitizeHtml(current, {
      allowedTags: [],
      allowedAttributes: {},
    })
      .replace(/&(?:amp|lt|gt|quot);/g, (m) => ENTITIES[m] ?? m)
      .trim();
    if (next === current) break;
    current = next;
  }
  return current;
};

/** PATCH /api/trips/:tripId params. */
export const tripIdParamSchema = z.object({
  tripId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid trip ID"),
});

/**
 * PATCH /api/trips/:tripId body. Unknown keys are dropped (mass-assignment
 * guard). Text is length-checked, trimmed, then stripped of HTML.
 */
export const updateTripBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(TRIP_TITLE_MAX)
    .transform(stripHtml)
    .refine((v) => v.length > 0, "Title must not be empty")
    .optional(),
  description: z
    .string()
    .trim()
    .max(TRIP_DESCRIPTION_MAX)
    .transform(stripHtml)
    .optional(),
});
