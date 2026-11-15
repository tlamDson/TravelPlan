/**
 * Insight Scraper Service (Vector Search Edition)
 *
 * Fetches search snippets for a city across multiple themes (food, history, nightlife)
 * via Serper API, and uses Gemini to extract structured Entity (PlaceInsight) arrays.
 */

import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../../config/env";
import { GEMINI_INSIGHT_MODEL } from "../../../config/gemini-models";
import { logger } from "../../../lib/logger";

const SERPER_URL = "https://google.serper.dev/search";

interface SerperOrganic {
  snippet?: string;
  [key: string]: unknown;
}

interface SerperResponse {
  organic?: SerperOrganic[];
}

export interface ExtractedEntity {
  name: string;
  category: "food" | "history" | "nightlife" | "nature" | "shopping" | "other";
  description: string;
  tags: string[];
  sourceQuery: string;
}

const THEMATIC_QUERIES = [
  {
    key: "food",
    query: (city: string, country: string) =>
      `best local food street food in ${city} ${country}`,
  },
  {
    key: "history",
    query: (city: string, country: string) =>
      `top historical sites museums in ${city} ${country}`,
  },
  {
    key: "nightlife",
    query: (city: string, country: string) =>
      `best nightlife hidden bars in ${city} ${country}`,
  },
];

export async function extractCityEntities(
  cityNameEn: string,
  countryNameEn: string,
): Promise<ExtractedEntity[]> {
  logger.info(
    { city: cityNameEn, country: countryNameEn },
    "Fetching multi-query Serper results",
  );

  const allEntities: ExtractedEntity[] = [];

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_INSIGHT_MODEL });

  for (const theme of THEMATIC_QUERIES) {
    const query = theme.query(cityNameEn, countryNameEn);
    try {
      const res = await axios.post<SerperResponse>(
        SERPER_URL,
        { q: query, num: 5 },
        { headers: { "X-API-KEY": env.SERPER_API_KEY } },
      );

      const snippets = (res.data?.organic ?? [])
        .slice(0, 5)
        .map((o) => o.snippet)
        .filter((s): s is string => Boolean(s));

      if (snippets.length === 0) continue;

      const EXTRACT_PROMPT = `You are a travel data extractor. From the snippets below about ${cityNameEn}, ${countryNameEn}, extract 5-10 distinct places/venues related to the query "${query}". 

Format ONLY as a valid JSON array of objects without markdown formatting blocks and without backticks:
[
  { "name": "Place Name", "category": "${theme.key}", "description": "1-2 short sentences", "tags": ["tag1", "tag2"] }
]

Rules: 
- Only real places/venues (restaurants, museums, parks, markets, etc.).
- No generic advice. 
- "description" should be concise.
- "category" must be strictly one of: "food", "history", "nightlife", "nature", "shopping", "other" (can override if another category fits better, but try to use ${theme.key}).
- Output ONLY valid JSON array.

Snippets:
${snippets.join("\n\n")}`;

      const generateRes = await model.generateContent(EXTRACT_PROMPT);
      let text = generateRes.response.text()?.trim();

      // Clean up markdown markers if Gemini ignores the prompt
      if (text) {
        text = text
          .replace(/^```json/i, "")
          .replace(/^```/i, "")
          .replace(/```$/i, "")
          .trim();

        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item.name && item.description) {
                allEntities.push({
                  name: item.name,
                  category: [
                    "food",
                    "history",
                    "nightlife",
                    "nature",
                    "shopping",
                    "other",
                  ].includes(item.category)
                    ? item.category
                    : "other",
                  description: item.description,
                  tags: Array.isArray(item.tags) ? item.tags : [],
                  sourceQuery: theme.key,
                });
              }
            }
          }
        } catch (_err) {
          logger.warn(
            {
              city: cityNameEn,
              theme: theme.key,
              textSnippet: text.substring(0, 50),
            },
            "Failed to parse Gemini JSON output",
          );
        }
      }
    } catch (err) {
      logger.error(
        { city: cityNameEn, theme: theme.key, err },
        "Error fetching/generating for theme",
      );
    }

    // Slight pause to respect rate limits if any on Serper/Gemini
    await new Promise((res) => setTimeout(res, 500));
  }

  return allEntities;
}
