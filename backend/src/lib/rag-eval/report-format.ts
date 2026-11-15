/** Plain-text table for an EvalResult — what `npm run eval:rag` prints. */
import type { MeanCI } from "./bootstrap";
import type { EvalResult, MetricMap } from "./run-eval";

const f = (x: number) => x.toFixed(3);
const s = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
const cell = (m: MeanCI | undefined) =>
  m ? `${f(m.mean)} [${f(m.ci95[0])}, ${f(m.ci95[1])}]` : "—";

function row(label: string, metrics: MetricMap, names: string[]): string {
  return [
    label.padEnd(22),
    ...names.map((n) => cell(metrics[n]).padEnd(24)),
  ].join("");
}

export function formatReport(r: EvalResult): string {
  const out = [
    `RAG eval ${r.runId} @ ${r.gitSha.slice(0, 8)} — snapshot ${r.snapshotId}`,
    `N=${r.n} answerable queries (+${r.nNoAnswer} no_answer excluded), CI: city bootstrap B=${r.bootstrap.B} seed=${r.bootstrap.seed}`,
  ];
  for (const [setting, res] of Object.entries(r.settings)) {
    if (!res) continue;
    const names = Object.keys(res.oracle);
    out.push(
      "",
      `== ${setting} (pool ${res.poolSize} docs/query)`,
      ["".padEnd(22), ...names.map((n) => n.padEnd(24))].join(""),
      row("random", res.random, names),
      row("oracle", res.oracle, names),
      ...res.configs.map((c) => row(c.id, c.metrics, names)),
    );
    if (res.deltas.length > 0) out.push("", "paired deltas (95% CI):");
    for (const d of res.deltas) {
      out.push(
        `  ${d.to} − ${d.from}  ${d.metric.padEnd(10)} ${s(d.diff)} [${s(d.ci95[0])}, ${s(d.ci95[1])}]`,
      );
    }
  }
  return out.join("\n");
}
