/**
 * Offline RAG eval: scores every retriever in every setting against the
 * golden set, with random/oracle baselines, city-bootstrap 95% CIs and
 * paired deltas versus the first retriever (the production baseline).
 * Pure given its inputs — no DB, no network. Output shape:
 * docs/implementation/b3-data-formats.md §4.
 */
import { goldenSha } from "./golden-io";
import { validateGoldenSet } from "./golden-validate";
import type { GoldenItem, GoldenSet } from "./golden-schema";
import { mrr, ndcgAtK, recallAtK } from "./metrics";
import { oracleMetrics, randomExpected } from "./baselines";
import { clusterBootstrap } from "./bootstrap";
import { candidateRows, type Retriever, type Setting } from "./retriever";
import type { CorpusSnapshot } from "./snapshot-loader";
import type { QueryEmbeddingCache } from "./query-embedding-cache";
import type {
  ConfigResult,
  Delta,
  EvalResult,
  MetricMap,
  SettingResult,
} from "./eval-result";

export type * from "./eval-result";

/** Same depth production retrieval returns (TOP_K in place-insight-retrieval.service.ts). */
export const RETRIEVAL_DEPTH = 10;

export interface RunEvalInput {
  golden: GoldenSet;
  snapshot: CorpusSnapshot;
  queries: QueryEmbeddingCache;
  retrievers: Retriever[];
  settings: Setting[];
  ks: number[];
  bootstrap: { B: number; seed: number };
  runId: string;
  gitSha: string;
}

type PerQuery = Record<string, number>;

function aggregate(
  items: GoldenItem[],
  rows: PerQuery[],
  metric: string,
  bs: RunEvalInput["bootstrap"],
) {
  return clusterBootstrap(
    rows.map((r, i) => ({ cluster: items[i]!.cityIdKey, value: r[metric]! })),
    bs,
  );
}

function aggregateAll(
  items: GoldenItem[],
  rows: PerQuery[],
  names: string[],
  bs: RunEvalInput["bootstrap"],
): MetricMap {
  return Object.fromEntries(
    names.map((m) => [m, aggregate(items, rows, m, bs)]),
  );
}

function runSetting(
  input: RunEvalInput,
  setting: Setting,
  items: GoldenItem[],
  names: string[],
): SettingResult {
  const { snapshot, ks, bootstrap: bs } = input;
  const pools = items.map(
    (i) => candidateRows(snapshot, setting, i.cityIdKey).length,
  );
  const grades = items.map((i) => Object.values(i.labels));

  const configs = input.retrievers.map(
    (r): ConfigResult & { rows: PerQuery[] } => {
      const tops = items.map((i) =>
        r.retrieve(
          {
            id: i.id,
            text: i.query,
            cityIdKey: i.cityIdKey,
            vector: input.queries.get(i.query),
          },
          setting,
          RETRIEVAL_DEPTH,
        ),
      );
      const rows = tops.map((top, idx) => {
        const rel = items[idx]!.labels;
        const row: PerQuery = {
          "ndcg@5": ndcgAtK(top, rel, 5),
          mrr: mrr(top, rel),
        };
        for (const k of ks) row[`recall@${k}`] = recallAtK(top, rel, k);
        return row;
      });
      return {
        id: r.id,
        params: r.params,
        rows,
        metrics: aggregateAll(items, rows, names, bs),
        perQuery: items.map((i, idx) => ({
          id: i.id,
          top: tops[idx]!.slice(0, 5),
          ...rows[idx],
        })),
      };
    },
  );

  const deltas: Delta[] = [];
  const [first, ...rest] = configs;
  for (const c of rest) {
    for (const metric of names) {
      const diffs = c.rows.map(
        (row, i) => row[metric]! - first!.rows[i]![metric]!,
      );
      const { mean, ci95 } = aggregate(
        items,
        diffs.map((d) => ({ [metric]: d })),
        metric,
        bs,
      );
      deltas.push({ from: first!.id, to: c.id, metric, diff: mean, ci95 });
    }
  }

  return {
    poolSize:
      Math.min(...pools) === Math.max(...pools)
        ? String(pools[0])
        : `${Math.min(...pools)}–${Math.max(...pools)}`,
    random: aggregateAll(
      items,
      items.map((_, i) => randomExpected(pools[i]!, grades[i]!, ks)),
      names,
      bs,
    ),
    oracle: aggregateAll(
      items,
      grades.map((g) => oracleMetrics(g, ks)),
      names,
      bs,
    ),
    configs: configs.map(({ rows: _rows, ...c }) => c),
    deltas,
  };
}

export function runEval(input: RunEvalInput): EvalResult {
  const errors = validateGoldenSet(input.golden, input.snapshot);
  if (errors.length > 0)
    throw new Error(`golden set is invalid:\n${errors.join("\n")}`);
  if (input.retrievers.length === 0) throw new Error("runEval: no retrievers");

  const answerable = input.golden.items.filter(
    (i) => i.queryType !== "no_answer",
  );
  if (answerable.length === 0)
    throw new Error("runEval: no answerable golden items");
  const names = [...input.ks.map((k) => `recall@${k}`), "ndcg@5", "mrr"];

  const settings: EvalResult["settings"] = {};
  for (const s of input.settings)
    settings[s] = runSetting(input, s, answerable, names);

  return {
    schemaVersion: 1,
    runId: input.runId,
    gitSha: input.gitSha,
    goldenSha: goldenSha(input.golden),
    snapshotId: input.snapshot.meta.snapshotId,
    n: answerable.length,
    nNoAnswer: input.golden.items.length - answerable.length,
    bootstrap: { ...input.bootstrap, cluster: "city" },
    settings,
  };
}
