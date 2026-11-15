/** Shape of results/rag/*.json — docs/implementation/b3-data-formats.md §4. */
import type { MeanCI } from "./bootstrap";
import type { Setting } from "./retriever";

export type MetricMap = Record<string, MeanCI>;

export interface ConfigResult {
  id: string;
  params: Record<string, unknown>;
  metrics: MetricMap;
  perQuery: ({ id: string; top: string[] } & Record<string, unknown>)[];
}

export interface Delta {
  from: string;
  to: string;
  metric: string;
  diff: number;
  ci95: [number, number];
}

export interface SettingResult {
  poolSize: string;
  random: MetricMap;
  oracle: MetricMap;
  configs: ConfigResult[];
  deltas: Delta[];
}

export interface EvalResult {
  schemaVersion: 1;
  runId: string;
  gitSha: string;
  goldenSha: string;
  snapshotId: string;
  n: number;
  nNoAnswer: number;
  bootstrap: { B: number; seed: number; cluster: "city" };
  settings: Partial<Record<Setting, SettingResult>>;
}
