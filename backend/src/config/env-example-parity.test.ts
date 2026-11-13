import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

/**
 * [Guard] .env.example must mention every key config/env.ts's envalid
 * schema declares — commented lines like `# KEY=` count, this only checks
 * the key is *documented*, not filled in. A missing entry here is exactly
 * how FRONTEND_URL/CORS_ALLOWED_ORIGINS went undocumented and caused a real
 * CORS outage (see .claude/reference/pitfalls.md).
 */

const ENV_TS_PATH = path.join(__dirname, "env.ts");
const ENV_EXAMPLE_PATH = path.join(__dirname, "../../../.env.example");

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

function extractSchemaKeys(source: string): string[] {
  const matches = source.matchAll(/^\s{2}([A-Z0-9_]+):\s*(?:str|port)\(/gm);
  return [...matches].map((m) => m[1]).filter(isDefined);
}

function extractDocumentedKeys(source: string): Set<string> {
  const matches = source.matchAll(/^#?\s*([A-Z0-9_]+)=/gm);
  return new Set([...matches].map((m) => m[1]).filter(isDefined));
}

describe("[Guard] .env.example parity with config/env.ts schema", () => {
  it("documents every envalid key (commented lines count as documented)", () => {
    const envTsSource = fs.readFileSync(ENV_TS_PATH, "utf8");
    const envExampleSource = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");

    const schemaKeys = extractSchemaKeys(envTsSource);
    // Sanity check: if this regex ever stops matching (e.g. env.ts's
    // cleanEnv shape changes), fail loudly instead of silently passing
    // with an empty schemaKeys list.
    expect(schemaKeys.length).toBeGreaterThan(10);

    const documented = extractDocumentedKeys(envExampleSource);
    const missing = schemaKeys.filter((key) => !documented.has(key));

    expect(missing).toEqual([]);
  });
});
