/**
 * Pure, DB/network-free pieces of the RAG retrieval pipeline — split out of
 * place-insight-retrieval.service.ts to keep that file under the repo's
 * 200-line limit and to make the query-building/formatting logic directly
 * unit-testable without mocking Mongo or Gemini.
 */
import type { TripPreferences } from "@travelplan/shared";

export interface RetrievedInsight {
  /** Mongo _id of the PlaceInsight doc, stringified. Stable across
   * re-scrapes together with the unique (cityIdKey, name) index — the
   * label key the RAG eval harness's golden set grades against. */
  id: string;
  cityIdKey: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  score: number;
}

/**
 * Builds a search query string emphasizing the user's travel focus and constraints.
 */
export function buildRetrievalQuery(
  destination: string,
  preferences: TripPreferences,
): string {
  const parts: string[] = [destination];
  const focus = preferences.focus ?? [];

  if (focus.includes("Gastronomy"))
    parts.push("local food restaurants cafes culinary");
  if (focus.includes("Culture"))
    parts.push("museums history culture temples architecture");
  if (focus.includes("Nature"))
    parts.push("parks nature viewpoints outdoors scenery");
  if (focus.includes("Lifestyle"))
    parts.push("nightlife bars shopping local life");

  if (preferences.constraints?.foodAsMainActivities)
    parts.push("restaurants dining unique eats");

  if (preferences.pace === "relaxed") parts.push("chill relaxing peaceful");

  return parts.join(" ");
}

/** Formats retrieved insights into the numbered list injected into the
 * Gemini prompt under [LOCAL KNOWLEDGE — HIGH PRIORITY]. */
export function formatInsightsForPrompt(results: RetrievedInsight[]): string {
  return results
    .map((r, i) => `${i + 1}. ${r.name} (${r.category}): ${r.description}`)
    .join("\n");
}
