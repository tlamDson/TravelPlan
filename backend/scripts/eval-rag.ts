/**
 * B3 · Offline RAG eval runner. Pure scoring lives in src/lib/rag-eval/;
 * this file parses flags, loads the committed data and writes results.
 *
 *   npm run eval:rag -w backend
 *   npm run eval:rag -w backend -- --setting global,city --k 3,5 --configs vector-prod
 *   npm run eval:rag -w backend -- --parity     (needs MONGO_URI to the Atlas
 *                                                 DB the snapshot came from)
 *
 * Writes backend/eval/results/rag/latest.json plus a dated copy. The
 * offline run needs no network; --parity only reads Atlas with the cached
 * query vectors (no Gemini calls).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  CORPUS_DIR,
  GOLDEN_PATH,
  QUERY_CACHE_DIR,
  RAG_RESULTS_DIR,
} from "../src/lib/rag-eval/eval-paths";
import { loadGoldenSet } from "../src/lib/rag-eval/golden-io";
import { loadSnapshot } from "../src/lib/rag-eval/snapshot-loader";
import { loadQueryEmbeddingCache } from "../src/lib/rag-eval/query-embedding-cache";
import {
  buildRetrievers,
  DEFAULT_CONFIGS,
} from "../src/lib/rag-eval/retriever-registry";
import { SETTINGS, type Setting } from "../src/lib/rag-eval/retriever";
import { runEval } from "../src/lib/rag-eval/run-eval";
import { formatReport } from "../src/lib/rag-eval/report-format";
import { runParity } from "./eval-rag-parity";

/** Accepts both `--flag=value` and `--flag value`. */
function arg(flag: string): string | undefined {
  const argv = process.argv;
  const eq = argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--")
    ? argv[i + 1]
    : undefined;
}
const list = (v: string | undefined, d: string[]) =>
  v
    ? v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : d;

function gitSha(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { encoding: "utf8" },
    ).trim();
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return "unknown";
  }
}

async function main() {
  const snapshot = loadSnapshot(CORPUS_DIR);
  const golden = loadGoldenSet(GOLDEN_PATH);
  const queries = loadQueryEmbeddingCache(QUERY_CACHE_DIR);
  if (!queries)
    throw new Error(
      "no query embedding cache — run npm run eval:embed-queries -w backend",
    );
  if (queries.model !== snapshot.meta.embeddingModel) {
    throw new Error(
      `query vectors are ${queries.model} but the corpus is ${snapshot.meta.embeddingModel}`,
    );
  }
  fs.mkdirSync(RAG_RESULTS_DIR, { recursive: true });

  if (process.argv.includes("--parity")) {
    const summary = await runParity(golden, snapshot, queries);
    fs.writeFileSync(
      path.join(RAG_RESULTS_DIR, "parity.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    console.log(
      `parity (city setting, k=${summary.k}): N=${summary.n}, mean overlap@${summary.k} ${summary.meanOverlap.toFixed(3)}, exact order ${summary.exactOrderRate.toFixed(3)}`,
    );
    return;
  }

  const settings = list(arg("--setting"), [...SETTINGS]) as Setting[];
  for (const s of settings)
    if (!SETTINGS.includes(s)) throw new Error(`unknown setting ${s}`);
  const ks = list(arg("--k"), ["3", "5"]).map(Number);
  if (ks.some((k) => !Number.isInteger(k) || k < 1))
    throw new Error("--k must be positive integers");

  const now = new Date();
  const runId = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const result = runEval({
    golden,
    snapshot,
    queries,
    retrievers: buildRetrievers(
      snapshot,
      list(arg("--configs"), DEFAULT_CONFIGS),
    ),
    settings,
    ks,
    bootstrap: {
      B: Number(arg("--B") ?? 2000),
      seed: Number(arg("--seed") ?? 42),
    },
    runId,
    gitSha: gitSha(),
  });

  const json = `${JSON.stringify(result, null, 2)}\n`;
  fs.writeFileSync(path.join(RAG_RESULTS_DIR, "latest.json"), json);
  fs.writeFileSync(
    path.join(
      RAG_RESULTS_DIR,
      `${now.toISOString().slice(0, 10)}-${runId}.json`,
    ),
    json,
  );
  console.log(formatReport(result));
  console.log(`\nwritten to ${RAG_RESULTS_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
