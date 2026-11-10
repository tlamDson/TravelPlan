/**
 * Default locations under backend/eval/ (outside src/, so not in the
 * Docker image or tsc's scope). Resolved from this source file, so they're
 * correct for the tsx-run scripts in backend/scripts/ — the only callers.
 */
import path from "node:path";

export const EVAL_DIR = path.resolve(__dirname, "..", "..", "..", "eval");
export const CORPUS_DIR = path.join(EVAL_DIR, "data", "corpus");
export const QUERY_CACHE_DIR = path.join(EVAL_DIR, "data", "queries");
export const RAG_RESULTS_DIR = path.join(EVAL_DIR, "results", "rag");
export const GOLDEN_PATH = path.join(
  EVAL_DIR,
  "golden",
  "rag-golden-set.v1.json",
);
export const DRAFT_QUERIES_PATH = path.join(
  EVAL_DIR,
  "golden",
  "queries.v1.jsonl",
);
