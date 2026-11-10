/**
 * Pinned, not "-latest" — verified 2026-08-15 by calling the real API with
 * this key (gemini-2.0-flash AND gemini-2.5-flash both returned a live 404
 * "no longer available"; gemini-3.6-flash was the newest non-preview flash
 * model this key could actually reach). Deliberately not `gemini-flash-latest`:
 * intent-parser.service's JSON extraction is fragile regex, not a real
 * parser (see `.claude/rules/tech-defaults.md`'s known `extractJson()` bug
 * with bare arrays) — an unannounced silent model swap changing output
 * formatting is a worse failure mode than a pinned model eventually
 * deprecating loudly. Re-verify with `npm run check:services` (note: that
 * only proves the API key is valid via the models-list endpoint, not that
 * this exact model string still resolves — a generateContent call, like
 * the one used to verify this pin, is the real test).
 *
 * Single source of truth — every Gemini generateContent call in the backend
 * imports this instead of hardcoding a model string. `ai-agent.service.ts`
 * used to own this constant privately; `insight-scraper.service.ts` had its
 * own hardcoded `"gemini-2.0-flash"` that the original fix missed entirely,
 * so every RAG scraping job was silently 404ing. Centralizing it here is
 * what makes that class of miss structurally impossible going forward.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Model used ONLY by insight-scraper.service.ts (RAG corpus entity
 * extraction from Serper search snippets) — deliberately a *different*
 * model from GEMINI_MODEL, not a shared constant.
 *
 * Live incident, 2026-08-22: this used to import GEMINI_MODEL too. Google's
 * free-tier quota is per-model-per-project-per-day
 * (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) — verified live at
 * only 20 requests/day for gemini-3.6-flash on this key. A single 26-city
 * RAG corpus seed needs ~78 generateContent calls (26 cities x 3 themes),
 * which exhausted the day's quota in minutes — and because ai-agent.service.ts
 * (real trip generation) uses the exact same model, that meant a corpus
 * scrape could 429 real user-facing trip generation on staging for the rest
 * of the day, sharing one quota bucket between two very different-risk
 * consumers.
 *
 * gemini-3.5-flash-lite verified live via a real generateContent call
 * (2026-08-22) — separate model, separate quota bucket. Entity extraction
 * from short search snippets doesn't need a stronger model; the pipeline
 * already tolerates imperfect output per-theme (extractCityEntities()
 * swallows parse failures and just logs a warning, see
 * insight-scraper.service.ts), so occasional lite-model format drift is a
 * far cheaper failure mode here than it would be for trip generation.
 */
export const GEMINI_INSIGHT_MODEL = "gemini-3.5-flash-lite";

/**
 * Embedding model for the RAG corpus (PlaceInsight.embedding) and query
 * vectors. Lives here (not in embedding.service.ts) so tooling such as
 * scripts/export-rag-snapshot.ts can record it without importing
 * config/env — whose envalid fail-fast would demand every API key.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
