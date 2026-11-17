import { z } from "zod";
import sanitizeHtml from "sanitize-html";

export const TRIP_TITLE_MAX = 200;
export const TRIP_DESCRIPTION_MAX = 2000;

const stripHtml = (value: string): string =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();

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
