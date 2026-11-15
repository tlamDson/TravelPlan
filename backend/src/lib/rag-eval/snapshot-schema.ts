/**
 * Zod contract for backend/eval/data/corpus/placeinsights.meta.json — see
 * docs/implementation/b3-data-formats.md §2. Eval-only, so it lives here
 * rather than in packages/shared (no API or frontend consumer).
 */
import { z } from "zod";

export const SnapshotDocSchema = z.object({
  row: z.number().int().nonnegative(),
  label: z.string().min(1),
  cityIdKey: z.string().min(1),
  countryIdKey: z.string(),
  name: z.string().min(1),
  category: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  sourceQuery: z.string(),
});

export const SnapshotMetaSchema = z.object({
  snapshotId: z.string().min(1),
  exportedAt: z.string(),
  sourceDb: z.string(),
  embeddingModel: z.string(),
  dims: z.number().int().positive(),
  dtype: z.literal("float32-le"),
  count: z.number().int().positive(),
  lossless: z.boolean(),
  binSha256: z.string().regex(/^[0-9a-f]{64}$/),
  docs: z.array(SnapshotDocSchema),
});

export type SnapshotDoc = z.infer<typeof SnapshotDocSchema>;
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;
