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

const MAX_SANITIZE_ROUNDS = 5;

const sanitizeOnce = (value: string): string =>
  sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(?:amp|lt|gt|quot);/g, (m) => ENTITIES[m] ?? m)
    .trim();

/**
 * sanitize-html returns HTML, so it escapes & < > " in text. These fields are
 * plain text (React escapes them on render), so decode those four entities
 * back or "Tom & Jerry" would be stored as "Tom &amp; Jerry". Decoding can
 * reveal markup that was entity-encoded in the input, so repeat until a round
 * changes nothing. Returns null when the value is still changing after
 * MAX_SANITIZE_ROUNDS (markup nested under many encoding layers): the caller
 * rejects it rather than store text that a further pass would still alter.
 */
const stripHtml = (value: string): string | null => {
  let current = value;
  for (let i = 0; i < MAX_SANITIZE_ROUNDS; i++) {
    const next = sanitizeOnce(current);
    if (next === current) return current;
    current = next;
  }
  return null;
};

const plainText = (field: string) => (value: string, ctx: z.RefinementCtx) => {
  const clean = stripHtml(value);
  if (clean === null) {
    ctx.addIssue({
      code: "custom",
      message: `${field} contains too many layers of encoded markup`,
    });
    return z.NEVER;
  }
  return clean;
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
    .transform(plainText("Title"))
    .refine((v) => v.length > 0, "Title must not be empty")
    .optional(),
  description: z
    .string()
    .trim()
    .max(TRIP_DESCRIPTION_MAX)
    .transform(plainText("Description"))
    .optional(),
});
