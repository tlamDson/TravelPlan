/**
 * Zod contract for backend/eval/golden/rag-golden-set.v1.json — see
 * docs/implementation/b3-data-formats.md §1. Labels hold only grades 1–2;
 * an absent label means grade 0. `labeledAt: null` marks an item whose
 * query was written but not yet labeled (golden-labeling.ts).
 */
import { z } from "zod";

export const QUERY_TYPES = [
  "specific",
  "thematic",
  "paraphrase",
  "no_answer",
] as const;

export const GoldenItemSchema = z.object({
  id: z.string().regex(/^q-[a-z0-9_-]+-\d{3,}$/),
  cityIdKey: z.string().min(1),
  countryIdKey: z.string().min(1),
  query: z.string().trim().min(1),
  queryType: z.enum(QUERY_TYPES),
  source: z.enum(["human", "llm_drafted_human_edited"]),
  preferences: z.record(z.string(), z.unknown()).nullable(),
  labels: z.record(z.string(), z.union([z.literal(1), z.literal(2)])),
  exhaustive: z.boolean(),
  labeledAt: z.string().nullable(),
  notes: z.string(),
});

export const GoldenSetSchema = z.object({
  version: z.literal(1),
  snapshotId: z.string().min(1),
  labeler: z.string().min(1),
  gradeScale: z.record(z.string(), z.string()),
  folds: z.record(z.string(), z.number().int()),
  items: z.array(GoldenItemSchema),
});

export type GoldenItem = z.infer<typeof GoldenItemSchema>;
export type GoldenSet = z.infer<typeof GoldenSetSchema>;
export type QueryType = (typeof QUERY_TYPES)[number];
