import fs from "node:fs";
import path from "node:path";
import { GoldenSetSchema, type GoldenSet } from "./golden-schema";
import { sha256Hex } from "./snapshot-codec";

export function serializeGoldenSet(golden: GoldenSet): string {
  return `${JSON.stringify(GoldenSetSchema.parse(golden), null, 2)}\n`;
}

export function loadGoldenSet(file: string): GoldenSet {
  if (!fs.existsSync(file)) {
    throw new Error(
      `golden set not found at ${file} — run npm run eval:label-golden -w backend -- --init`,
    );
  }
  return GoldenSetSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

/** Writes via a temp file + rename so a crash mid-labeling never leaves a
 * truncated golden set behind. */
export function saveGoldenSet(file: string, golden: GoldenSet): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.partial`;
  fs.writeFileSync(tmp, serializeGoldenSet(golden));
  fs.renameSync(tmp, file);
}

/** Identifies the exact golden set a result was computed on. */
export const goldenSha = (golden: GoldenSet): string =>
  sha256Hex(serializeGoldenSet(golden));
