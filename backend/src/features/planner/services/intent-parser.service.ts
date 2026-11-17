import { z } from "zod";
import { logger } from "../../../lib/logger";

/** Slot order for 2–6 activities/day. Used by flattenIntents and itinerary-builder. */
export const SLOT_ORDER = [
  "breakfast",
  "morning",
  "late morning",
  "lunch",
  "afternoon",
  "late afternoon",
  "dinner",
  "evening",
  "night",
] as const;

export type SlotName = (typeof SLOT_ORDER)[number];

/** Day slots: record of slot name → search query. Supports 2–6 slots per day. */
const DaySlotsSchema = z
  .record(z.string(), z.string())
  .refine((obj) => Object.keys(obj).length > 0, "At least one slot required");

export const TripIntentsSchema = z.record(z.string(), DaySlotsSchema);

export type TripIntents = z.infer<typeof TripIntentsSchema>;

/**
 * Sorts day keys ("day1", "day2", … "day10", …) numerically instead of
 * lexicographically. Object.keys(intents).sort() alone is a plain string
 * sort, so "day10" < "day2" as strings — this scrambled the day order for
 * any trip of 10+ days. Keys are always normalizeDayKey()'s unpadded
 * `day${n}` form, so extracting the numeric suffix is safe.
 *
 * Shared by flattenIntents() and itinerary-builder's buildTaggedPlaces(),
 * which MUST iterate in the exact same order — buildTaggedPlaces indexes
 * validated[idx] assuming 1:1 alignment with flattenIntents' output, so
 * fixing one without the other would desync places from the wrong day.
 */
export function sortedDayKeys(intents: TripIntents): string[] {
  return Object.keys(intents).sort(
    (a, b) => Number(a.slice(3)) - Number(b.slice(3)),
  );
}

export class IntentParserService {
  private extractJson(aiResponse: string): string {
    const trimmed = aiResponse.trim();

    // A reply that is already valid JSON (e.g. a bare array) must not be cut
    // by the brace-based fallback below, which would drop the `[`/`]`.
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // not plain JSON — fall through to fence/brace extraction
    }

    const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedJson?.[1]) {
      return fencedJson[1].trim();
    }

    const fenced = trimmed.match(/```([\s\S]*?)```/);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  }

  private coerceRoot(raw: unknown): Record<string, unknown> {
    if (Array.isArray(raw)) {
      return raw.reduce<Record<string, unknown>>((acc, day, index) => {
        acc[`day${index + 1}`] = day;
        return acc;
      }, {});
    }

    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (obj.itinerary && typeof obj.itinerary === "object") {
        return obj.itinerary as Record<string, unknown>;
      }
      if (obj.days && typeof obj.days === "object") {
        return obj.days as Record<string, unknown>;
      }
      return obj;
    }

    return {};
  }

  private normalizeDayKey(key: string): string | null {
    const normalized = key.trim().toLowerCase();
    const dayMatch = normalized.match(/^day\s*0*(\d+)$/);
    if (dayMatch?.[1]) {
      return `day${Number(dayMatch[1])}`;
    }

    const numericMatch = normalized.match(/^0*(\d+)$/);
    if (numericMatch?.[1]) {
      return `day${Number(numericMatch[1])}`;
    }

    return null;
  }

  private normalizeSlotKey(key: string): SlotName | null {
    const normalized = key.trim().toLowerCase().replace(/\s+/g, " ");

    if (["breakfast", "brunch"].includes(normalized)) return "breakfast";

    if (["morning", "am", "a.m.", "morn"].includes(normalized))
      return "morning";
    if (["late morning", "mid morning"].includes(normalized))
      return "late morning";

    if (["lunch", "noon meal"].includes(normalized)) return "lunch";

    if (["afternoon", "noon", "midday", "pm", "p.m."].includes(normalized))
      return "afternoon";
    if (["late afternoon", "mid afternoon"].includes(normalized))
      return "late afternoon";

    if (["dinner", "supper"].includes(normalized)) return "dinner";

    if (["evening"].includes(normalized)) return "evening";
    if (["night", "late night"].includes(normalized)) return "night";

    return null;
  }

  private normalizeSlotValue(value: unknown): string | null {
    if (typeof value === "string") return value.trim();

    if (value && typeof value === "object") {
      const maybeQuery = (value as { query?: unknown }).query;
      if (typeof maybeQuery === "string") {
        return maybeQuery.trim();
      }
    }

    if (value === null || value === undefined) return null;

    return String(value);
  }

  private normalizeSlots(raw: unknown): Record<string, string> {
    const slots: Record<string, string> = {};

    if (!raw || typeof raw !== "object") return slots;

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const slotKey = this.normalizeSlotKey(key);
      if (!slotKey) continue;
      const slotValue = this.normalizeSlotValue(value);
      if (slotValue) slots[slotKey] = slotValue;
    }

    return slots;
  }

  private normalizeIntents(
    raw: unknown,
  ): Record<string, Record<string, string>> {
    const root = this.coerceRoot(raw);
    const normalized: Record<string, Record<string, string>> = {};

    for (const [key, value] of Object.entries(root)) {
      const dayKey = this.normalizeDayKey(key);
      if (!dayKey) continue;
      const slots = this.normalizeSlots(value);
      if (Object.keys(slots).length > 0) normalized[dayKey] = slots;
    }

    return normalized;
  }

  parseIntents(aiResponse: string): TripIntents {
    const cleaned = this.extractJson(aiResponse);
    const responsePreview = aiResponse.slice(0, 2000);
    const responseLength = aiResponse.length;

    logger.info(
      { responseLength, fullResponse: aiResponse },
      "📄 Raw AI response received",
    );

    try {
      const parsed = JSON.parse(cleaned);
      logger.info({ parsed }, "✅ JSON parsed successfully");

      const normalized = this.normalizeIntents(parsed);
      logger.info({ normalized }, "✅ Intents normalized");

      const result = TripIntentsSchema.safeParse(normalized);
      if (!result.success) {
        logger.error(
          {
            responseLength,
            responsePreview,
            zodError: result.error.flatten(),
            normalized,
          },
          "❌ Zod validation failed on normalized intents",
        );
        throw new Error("AI returned invalid JSON format");
      }

      return result.data;
    } catch (error: any) {
      logger.error(
        {
          responseLength,
          responsePreview,
          cleaned,
          error: error.message,
          stack: error.stack,
        },
        "❌ Failed to parse AI intents",
      );
      throw new Error("AI returned invalid JSON format");
    }
  }

  flattenIntents(intents: TripIntents): string[] {
    const all: string[] = [];

    for (const day of sortedDayKeys(intents)) {
      const slots = intents[day];
      if (!slots) continue;
      for (const slotName of SLOT_ORDER) {
        const q = slots[slotName];
        if (q && q.trim()) all.push(q);
      }
    }

    return all;
  }

  isValidIntentFormat(intents: unknown): boolean {
    try {
      TripIntentsSchema.parse(intents);
      return true;
    } catch {
      return false;
    }
  }
}

export const intentParserService = new IntentParserService();
