/**
 * Cross-checks a golden set against the corpus snapshot it was labeled
 * on. Returns every problem at once (not just the first) so a labeling
 * session can be fixed in one pass. An empty array means valid.
 */
import { parseLabel } from "./label";
import type { GoldenSet } from "./golden-schema";
import type { CorpusSnapshot } from "./snapshot-loader";

export const FOLD_COUNT = 5;

export interface ValidateOpts {
  /** Accept drafted items that have no labels yet (labeledAt: null). */
  allowUnlabeled?: boolean;
}

export function validateGoldenSet(
  golden: GoldenSet,
  snapshot: CorpusSnapshot,
  opts: ValidateOpts = {},
): string[] {
  const errors: string[] = [];
  if (golden.snapshotId !== snapshot.meta.snapshotId) {
    errors.push(
      `snapshotId ${golden.snapshotId} != loaded snapshot ${snapshot.meta.snapshotId} — labels may point at docs that changed`,
    );
  }

  const countryOf = new Map(
    snapshot.docs.map((d) => [d.cityIdKey, d.countryIdKey]),
  );
  const seenIds = new Set<string>();

  for (const item of golden.items) {
    const at = `${item.id}:`;
    if (seenIds.has(item.id)) errors.push(`duplicate id ${item.id}`);
    seenIds.add(item.id);

    const country = countryOf.get(item.cityIdKey);
    if (country === undefined) {
      errors.push(`${at} city ${item.cityIdKey} not in snapshot`);
    } else if (country !== item.countryIdKey) {
      errors.push(
        `${at} countryIdKey ${item.countryIdKey} != snapshot's ${country}`,
      );
    }

    const fold = golden.folds[item.cityIdKey];
    if (fold === undefined || fold < 0 || fold >= FOLD_COUNT) {
      errors.push(
        `${at} city ${item.cityIdKey} has no fold in 0..${FOLD_COUNT - 1}`,
      );
    }

    const labelKeys = Object.keys(item.labels);
    for (const key of labelKeys) {
      if (!snapshot.rowOf.has(key)) {
        errors.push(`${at} label ${key} not in snapshot`);
      } else if (parseLabel(key).cityIdKey !== item.cityIdKey) {
        errors.push(
          `${at} label ${key} belongs to another city than ${item.cityIdKey}`,
        );
      }
    }

    if (item.labeledAt === null) {
      if (!opts.allowUnlabeled) errors.push(`${at} not labeled yet`);
      continue;
    }
    if (item.queryType === "no_answer" && labelKeys.length > 0) {
      errors.push(`${at} no_answer item must have empty labels`);
    }
    if (item.queryType !== "no_answer" && labelKeys.length === 0) {
      errors.push(
        `${at} has no labels — mark it no_answer if nothing in the city answers it`,
      );
    }
  }
  return errors;
}

export interface GoldenSummary {
  total: number;
  labeled: number;
  unlabeled: number;
  byType: Partial<Record<string, number>>;
  cities: number;
  /** `specific` items should have |R| ≤ 4 (data-formats §1). */
  specificOverFour: number;
}

export function summarizeGoldenSet(golden: GoldenSet): GoldenSummary {
  const byType: Partial<Record<string, number>> = {};
  for (const i of golden.items)
    byType[i.queryType] = (byType[i.queryType] ?? 0) + 1;
  const labeled = golden.items.filter((i) => i.labeledAt !== null).length;
  return {
    total: golden.items.length,
    labeled,
    unlabeled: golden.items.length - labeled,
    byType,
    cities: new Set(golden.items.map((i) => i.cityIdKey)).size,
    specificOverFour: golden.items.filter(
      (i) => i.queryType === "specific" && Object.keys(i.labels).length > 4,
    ).length,
  };
}
