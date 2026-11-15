/**
 * B3 · Validates the golden set against the committed corpus snapshot and
 * prints a summary. Exit 1 on any problem. Offline — no Mongo, no Gemini.
 *
 *   npm run eval:validate-golden -w backend
 *   npm run eval:validate-golden -w backend -- --allow-unlabeled   (mid-labeling)
 */
import { CORPUS_DIR, GOLDEN_PATH } from "../src/lib/rag-eval/eval-paths";
import { loadGoldenSet } from "../src/lib/rag-eval/golden-io";
import {
  summarizeGoldenSet,
  validateGoldenSet,
} from "../src/lib/rag-eval/golden-validate";
import { loadSnapshot } from "../src/lib/rag-eval/snapshot-loader";

function main() {
  const snapshot = loadSnapshot(CORPUS_DIR);
  const golden = loadGoldenSet(GOLDEN_PATH);
  const errors = validateGoldenSet(golden, snapshot, {
    allowUnlabeled: process.argv.includes("--allow-unlabeled"),
  });

  const s = summarizeGoldenSet(golden);
  console.log(
    [
      `golden: ${s.total} items (${s.labeled} labeled, ${s.unlabeled} unlabeled) across ${s.cities} cities`,
      `by type: ${JSON.stringify(s.byType)}`,
      `snapshot: ${snapshot.meta.snapshotId} (${snapshot.meta.count} docs)`,
    ].join("\n"),
  );
  if (s.specificOverFour > 0) {
    console.warn(
      `note: ${s.specificOverFour} "specific" item(s) have more than 4 relevant docs`,
    );
  }
  if (s.labeled < 100)
    console.warn(`note: ${s.labeled} labeled items — the plan needs ≥ 100`);

  if (errors.length > 0) {
    console.error(
      `\n${errors.length} problem(s):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("OK");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
