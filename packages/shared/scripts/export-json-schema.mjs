// Writes the analytics JSON Schema files from the built package (dist).
// Run via `npm run export:json-schema -w packages/shared`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnalyticsJsonSchemas } from "../dist/index.mjs";

const outDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../json-schema",
);
mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(buildAnalyticsJsonSchemas())) {
  writeFileSync(resolve(outDir, file), JSON.stringify(schema, null, 2) + "\n");
  process.stdout.write(`wrote json-schema/${file}\n`);
}
