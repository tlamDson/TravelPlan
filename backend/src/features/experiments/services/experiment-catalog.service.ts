import {
  EXPERIMENT_CATALOG,
  experimentDefinitionSchema,
  type ExperimentDefinition,
} from "@travelplan/shared";
import { experimentRepository } from "../repositories/experiment.repository";

export interface SeedCatalogResult {
  created: string[];
  existing: string[];
}

/**
 * Makes sure every catalog experiment exists in Mongo, as a draft when new.
 * All definitions are validated before any write, so a bad catalog entry
 * seeds nothing. Existing docs are never changed.
 */
export async function seedExperimentCatalog(
  catalog: readonly ExperimentDefinition[] = EXPERIMENT_CATALOG,
): Promise<SeedCatalogResult> {
  for (const def of catalog) {
    const parsed = experimentDefinitionSchema.safeParse(def);
    if (!parsed.success) {
      throw new Error(
        `Invalid experiment definition ${def.key}: ${parsed.error.message}`,
      );
    }
  }

  const result: SeedCatalogResult = { created: [], existing: [] };
  for (const def of catalog) {
    const inserted = await experimentRepository.insertDraftIfMissing(def);
    (inserted ? result.created : result.existing).push(def.key);
  }
  return result;
}
