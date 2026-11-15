import { z } from "zod";
import {
  analyticsEventBatchSchema,
  analyticsEventSchema,
  analyticsIngestResultSchema,
} from "./analytics.schema.js";

/**
 * JSON Schema (draft 2020-12) for the analytics contract, keyed by the file
 * name it is committed under in packages/shared/json-schema/. A parity test
 * fails when the committed files drift from the Zod source.
 */
export function buildAnalyticsJsonSchemas(): Record<string, unknown> {
  const opts = { target: "draft-2020-12", io: "input" } as const;
  return {
    "analytics-event.schema.json": z.toJSONSchema(analyticsEventSchema, opts),
    "analytics-event-batch.schema.json": z.toJSONSchema(
      analyticsEventBatchSchema,
      opts,
    ),
    "analytics-ingest-result.schema.json": z.toJSONSchema(
      analyticsIngestResultSchema,
      opts,
    ),
  };
}
