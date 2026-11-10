/**
 * The one place that defines a retrieval label. Golden-set labels, corpus
 * snapshot docs and retriever output are all keyed by
 * `${cityIdKey}::${name}` — never Mongo's `_id`, which changes whenever the
 * corpus is re-scraped while (cityIdKey, name) is the collection's unique
 * key (PlaceInsight.ts).
 */

export const LABEL_SEPARATOR = "::";

export interface LabelParts {
  cityIdKey: string;
  name: string;
}

export function toLabel({ cityIdKey, name }: LabelParts): string {
  if (!cityIdKey || !name) {
    throw new Error(
      `toLabel: cityIdKey and name must be non-empty (got "${cityIdKey}", "${name}")`,
    );
  }
  if (cityIdKey.includes(LABEL_SEPARATOR)) {
    throw new Error(
      `toLabel: cityIdKey "${cityIdKey}" contains "${LABEL_SEPARATOR}"`,
    );
  }
  return `${cityIdKey}${LABEL_SEPARATOR}${name}`;
}

/** Inverse of toLabel. Splits on the first separator only, so a place name
 * that itself contains "::" survives the round trip. */
export function parseLabel(label: string): LabelParts {
  const at = label.indexOf(LABEL_SEPARATOR);
  if (at <= 0 || at + LABEL_SEPARATOR.length >= label.length) {
    throw new Error(`parseLabel: "${label}" is not a cityIdKey::name label`);
  }
  return {
    cityIdKey: label.slice(0, at),
    name: label.slice(at + LABEL_SEPARATOR.length),
  };
}
