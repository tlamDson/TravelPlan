import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { ANALYTICS_EVENT_NAMES } from "../analytics.schema";
import { buildAnalyticsJsonSchemas } from "../analytics.json-schema";

const jsonSchemaDir = resolve(__dirname, "../../../json-schema");

type JsonNode = { [k: string]: unknown };

describe("analytics JSON Schema export", () => {
  const built = buildAnalyticsJsonSchemas();

  it("exports the event, batch and ingest-result schemas", () => {
    expect(Object.keys(built).sort()).toEqual([
      "analytics-event-batch.schema.json",
      "analytics-event.schema.json",
      "analytics-ingest-result.schema.json",
    ]);
  });

  it.each(Object.keys(buildAnalyticsJsonSchemas()))(
    "committed json-schema/%s is up to date (run `npm run export:json-schema -w packages/shared`)",
    (file) => {
      const committed = JSON.parse(
        readFileSync(resolve(jsonSchemaDir, file), "utf8"),
      );
      expect(committed).toEqual(built[file]);
    },
  );

  it("the event schema is draft 2020-12 with one strict member per catalog event", () => {
    const schema = built["analytics-event.schema.json"] as JsonNode;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const members = (schema.oneOf ?? schema.anyOf) as JsonNode[];
    const names = members.map(
      (m) => ((m.properties as JsonNode).name as JsonNode).const,
    );
    expect(names.sort()).toEqual([...ANALYTICS_EVENT_NAMES].sort());
    for (const m of members) {
      expect(m.additionalProperties).toBe(false);
      expect(m.required).toEqual(
        expect.arrayContaining(["eventId", "name", "occurredAt", "properties"]),
      );
    }
  });
});
