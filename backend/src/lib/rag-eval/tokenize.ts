/**
 * Tokenizer + document text for BM25. Shared by the offline eval and (PR 5)
 * production hybrid retrieval, so both index exactly the same tokens.
 */

// Small, English-only on purpose: queries are written in English, and a
// stopword list in other languages would silently drop place-name words
// ("de", "la", "le") that are meaningful in names.
const STOPWORDS = new Set(
  "a an and are as at be but by for from has have i in is it its me my of on or our so that the their them then there these they this to was we were what when where which who why will with you your".split(
    " ",
  ),
);

/** NFKD + strip combining marks; đ/Đ has no decomposition so map it by hand. */
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export interface InsightTextFields {
  name: string;
  category: string;
  tags: string[];
  description: string;
}

/** The single text BM25 indexes per PlaceInsight. Plain concatenation — no
 * field boosts, since any weighting would be a hyperparameter tuned on the
 * golden set. */
export function insightText(d: InsightTextFields): string {
  return [d.name, d.category, ...d.tags, d.description].join(" ");
}
