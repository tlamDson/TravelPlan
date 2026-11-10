/**
 * Pure logic behind scripts/label-golden.ts. Workflow: Lam writes queries
 * into a JSONL draft *before* looking at any doc (so wording isn't biased
 * toward BM25), imports them as unlabeled items, then grades each city's
 * docs in the CLI.
 */
import { z } from "zod";
import { toLabel } from "./label";
import { FOLD_COUNT } from "./golden-validate";
import {
  GoldenItemSchema,
  QUERY_TYPES,
  type GoldenItem,
  type GoldenSet,
} from "./golden-schema";
import type { CorpusSnapshot } from "./snapshot-loader";
import type { SnapshotDoc } from "./snapshot-schema";

export function makeFolds(
  cities: string[],
  k = FOLD_COUNT,
): Record<string, number> {
  const sorted = [...new Set(cities)].sort();
  return Object.fromEntries(sorted.map((c, i) => [c, i % k]));
}

export function initGoldenSet(
  snapshot: CorpusSnapshot,
  labeler: string,
): GoldenSet {
  return {
    version: 1,
    snapshotId: snapshot.meta.snapshotId,
    labeler,
    gradeScale: { "1": "liên quan một phần", "2": "trả lời trực tiếp" },
    folds: makeFolds(snapshot.docs.map((d) => d.cityIdKey)),
    items: [],
  };
}

const DraftSchema = z.object({
  cityIdKey: z.string().min(1),
  query: z.string().trim().min(1),
  queryType: z.enum(QUERY_TYPES).default("specific"),
  source: GoldenItemSchema.shape.source.default("human"),
  notes: z.string().default(""),
});
export type DraftQuery = z.infer<typeof DraftSchema>;

export function parseDraftLine(line: string): DraftQuery {
  return DraftSchema.parse(JSON.parse(line));
}

export function cityDocs(
  snapshot: CorpusSnapshot,
  cityIdKey: string,
): SnapshotDoc[] {
  return snapshot.docs.filter((d) => d.cityIdKey === cityIdKey);
}

function nextId(items: GoldenItem[], city: string): string {
  const prefix = `q-${city}-`;
  const max = items
    .filter((i) => i.id.startsWith(prefix))
    .reduce((m, i) => Math.max(m, Number(i.id.slice(prefix.length))), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function importDrafts(
  golden: GoldenSet,
  drafts: DraftQuery[],
  snapshot: CorpusSnapshot,
): { golden: GoldenSet; added: number; skipped: number } {
  const items = [...golden.items];
  let added = 0;
  let skipped = 0;
  for (const d of drafts) {
    const first = cityDocs(snapshot, d.cityIdKey)[0];
    if (!first)
      throw new Error(`importDrafts: city ${d.cityIdKey} not in snapshot`);
    if (items.some((i) => i.cityIdKey === d.cityIdKey && i.query === d.query)) {
      skipped++;
      continue;
    }
    items.push({
      id: nextId(items, d.cityIdKey),
      cityIdKey: d.cityIdKey,
      countryIdKey: first.countryIdKey,
      query: d.query,
      queryType: d.queryType,
      source: d.source,
      preferences: null,
      labels: {},
      exhaustive: false,
      labeledAt: null,
      notes: d.notes,
    });
    added++;
  }
  return { golden: { ...golden, items }, added, skipped };
}

/** "1:2, 3:1" → Map{1→2, 3→1}; "none" or blank → empty. Indexes are
 * 1-based positions in cityDocs() as printed by the CLI. */
export function parseGradeInput(
  input: string,
  docCount: number,
): Map<number, 1 | 2> {
  const out = new Map<number, 1 | 2>();
  const text = input.trim().toLowerCase();
  if (text === "" || text === "none") return out;
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+):(\d+)$/.exec(token);
    if (!m) throw new Error(`"${token}" is not index:grade`);
    const idx = Number(m[1]);
    const grade = Number(m[2]);
    if (idx < 1 || idx > docCount)
      throw new Error(`index ${idx} out of range 1..${docCount}`);
    if (grade !== 1 && grade !== 2)
      throw new Error(`grade ${grade} must be 1 or 2`);
    if (out.has(idx)) throw new Error(`index ${idx} given twice`);
    out.set(idx, grade);
  }
  return out;
}

export function applyGrades(
  item: GoldenItem,
  docs: SnapshotDoc[],
  grades: Map<number, 1 | 2>,
  today: string,
): GoldenItem {
  const labels: GoldenItem["labels"] = {};
  for (const [idx, grade] of grades) labels[toLabel(docs[idx - 1]!)] = grade;

  const noAnswer = grades.size === 0 && item.queryType !== "no_answer";
  return {
    ...item,
    labels,
    exhaustive: true,
    labeledAt: today,
    queryType: noAnswer ? "no_answer" : item.queryType,
    notes: noAnswer
      ? [item.notes, `converted from ${item.queryType}: no relevant doc`]
          .filter(Boolean)
          .join("; ")
      : item.notes,
  };
}
