# Offline RAG eval

Deterministic retrieval eval for TravelPlan's RAG (`PlaceInsight` + Atlas `$vectorSearch`). It runs with **no network**: the corpus and every query vector are committed snapshots, and ranking is exact cosine computed in-process. CI and local machines can't run `$vectorSearch`, and the eval must not use Gemini quota.

Code: `backend/src/lib/rag-eval/` (pure, unit-tested). Runners: `backend/scripts/` (thin I/O).

## Layout

| Path                                                | What                                                                                  | Written by             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| `data/corpus/placeinsights.meta.json` + `.f32`      | Corpus snapshot: doc metadata + raw float32 embeddings, sha256-checked                | `eval:export-snapshot` |
| `golden/queries.v1.jsonl`                           | Queries written **before** looking at any doc                                         | by hand                |
| `golden/rag-golden-set.v1.json`                     | Graded labels (`cityIdKey::name` → 1 or 2; absent = 0), city folds                    | `eval:label-golden`    |
| `data/queries/query-embeddings.index.json` + `.f32` | Cached query vectors (sha256 of exact text). A missing entry fails the run            | `eval:embed-queries`   |
| `results/rag/latest.json` (+ dated copies)          | Scores per setting and config, with CIs                                               | `eval:rag`             |
| `results/rag/parity.json`                           | Offline-vs-Atlas top-5 agreement                                                      | `eval:rag --parity`    |
| `data/rewrites/<rewriter>.json`                     | LLM keyword rewrites per query id (with the query's sha, so an edited query is stale) | `eval:rewrite-queries` |

Full field-by-field spec: `docs/implementation/b3-data-formats.md` (local only, not in git).

## Workflow

```bash
# 1. Export the corpus (read-only, needs MONGO_URI to the staging Atlas DB)
npm run eval:export-snapshot -w backend

# 2. Golden set
npm run eval:label-golden -w backend -- --init
#    write backend/eval/golden/queries.v1.jsonl, one per line:
#    {"cityIdKey":"tokyo","query":"tiny bars in old alleys","queryType":"specific"}
npm run eval:label-golden -w backend -- --import
npm run eval:label-golden -w backend -- --label            # answer "1:2 4:1", "none", s, q
npm run eval:validate-golden -w backend

# 3. Embed queries once (Gemini free tier, ~85/min, resumable)
npm run eval:embed-queries -w backend

# 4. (for hybrid-rewrite) Rewrite queries once with local Qwen (llama-server :8081, cached, resumable)
npm run eval:rewrite-queries -w backend

# 5. Score (offline)
npm run eval:rag -w backend -- --setting global,city --k 3,5
npm run eval:rag -w backend -- --configs vector-prod,bm25,hybrid,hybrid-rewrite
npm run eval:rag -w backend -- --parity                    # needs MONGO_URI
```

## Configs

| Id               | What                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vector-prod`    | Exact cosine over the snapshot: production's dense-only path. Always first, and the baseline for deltas                                                                                    |
| `bm25`           | Okapi BM25 (k1 1.2, b 0.75) over `name + category + tags + description`. Accents are folded and English stopwords dropped. IDF is computed over the whole corpus, even in the city setting |
| `hybrid`         | RRF (k = 60) of the dense and BM25 top 50                                                                                                                                                  |
| `hybrid-rewrite` | Like `hybrid`, but BM25 searches a cached zero-shot LLM keyword rewrite of the query. The dense side keeps the original query vector                                                       |

Every parameter above is a published default or fixed in advance, and none is tuned on the golden set. That is why these configs need no city-fold cross-validation. Anything that _is_ tuned (the fine-tuned reranker) is reported with 5-fold city CV.

## How to read the numbers

- **Two settings, fixed in advance.** `global` ranks against the whole corpus with no city filter; it is the headline number. `city` ranks only against the query's city (~20 docs), which is the path trip generation actually takes. With ~20 candidates, a random ranking already scores recall@5 ≈ 0.25, so always read a number against the `random` row.
- **Metrics:** recall@k (grade ≥ 1), nDCG@5 (graded, gain 2^g − 1), MRR, all at retrieval depth 10 (production `TOP_K`). `no_answer` queries are excluded from every mean and counted separately.
- **Baselines:** `random` is the exact expectation of a uniformly random ranking of the same pool. `oracle` is a ranker that puts every relevant doc first, so recall@5 is capped at min(5, |R|)/|R|.
- **CIs:** 95% percentile bootstrap that resamples **cities**, not queries, since queries from one city share a corpus slice. Defaults are B = 2000 and seed 42, so the same inputs always produce the same output. A delta between two configs uses a paired bootstrap over per-query differences against the first config (`vector-prod`).
- **Report every config that was run**, not just the winner.

## Re-exporting

Only re-export when the corpus changes. Each export adds ~6 MB of binary to git history permanently, and it invalidates the golden set: `snapshotId` must match, and `eval:validate-golden` refuses a mismatch.
