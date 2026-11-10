/**
 * B3 · Golden-set labeling CLI (gate G2). Logic lives in
 * src/lib/rag-eval/golden-labeling.ts; this file is prompts and file I/O.
 *
 *   1. npm run eval:label-golden -w backend -- --init
 *        creates backend/eval/golden/rag-golden-set.v1.json pinned to the snapshot
 *   2. Write queries BEFORE looking at any doc, one JSON object per line, in
 *      backend/eval/golden/queries.v1.jsonl:
 *        {"cityIdKey":"tokyo","query":"tiny bars in old alleys","queryType":"specific"}
 *      queryType: specific (default) | thematic | paraphrase | no_answer
 *   3. npm run eval:label-golden -w backend -- --import
 *   4. npm run eval:label-golden -w backend -- --label [--city=tokyo]
 *        shows each unlabeled query with its city's docs; answer "1:2 4:1"
 *        (doc index:grade, 2 = answers it, 1 = partly), "none", "s" to skip,
 *        "q" to quit. Saves after every item.
 */
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  CORPUS_DIR,
  DRAFT_QUERIES_PATH,
  GOLDEN_PATH,
} from "../src/lib/rag-eval/eval-paths";
import { loadGoldenSet, saveGoldenSet } from "../src/lib/rag-eval/golden-io";
import {
  applyGrades,
  cityDocs,
  importDrafts,
  initGoldenSet,
  parseDraftLine,
  parseGradeInput,
} from "../src/lib/rag-eval/golden-labeling";
import { loadSnapshot } from "../src/lib/rag-eval/snapshot-loader";

const argValue = (flag: string) =>
  process.argv
    .find((a) => a.startsWith(`${flag}=`))
    ?.split("=")
    .slice(1)
    .join("=");

async function label(cityFilter: string | undefined) {
  const snapshot = loadSnapshot(CORPUS_DIR);
  let golden = loadGoldenSet(GOLDEN_PATH);
  const rl = createInterface({ input: process.stdin, terminal: false });
  // Line iterator rather than rl.question(): question() drops lines that
  // arrive while no question is pending (e.g. piped or pasted input).
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? "q" : String(next.value);
  };
  const today = new Date().toISOString().slice(0, 10);

  try {
    for (const pending of golden.items.filter(
      (i) =>
        i.labeledAt === null && (!cityFilter || i.cityIdKey === cityFilter),
    )) {
      const docs = cityDocs(snapshot, pending.cityIdKey);
      console.log(
        `\n=== ${pending.id} [${pending.queryType}] ${pending.cityIdKey}\n» ${pending.query}\n`,
      );
      docs.forEach((d, i) =>
        console.log(
          `${String(i + 1).padStart(2)}. ${d.name} (${d.category}) — ${d.description}`,
        ),
      );
      for (;;) {
        const answer = (await ask("\ngrades> ")).trim();
        if (answer === "q") return;
        if (answer === "s") break;
        try {
          const labeled = applyGrades(
            pending,
            docs,
            parseGradeInput(answer, docs.length),
            today,
          );
          golden = {
            ...golden,
            items: golden.items.map((i) => (i.id === labeled.id ? labeled : i)),
          };
          saveGoldenSet(GOLDEN_PATH, golden);
          break;
        } catch (e) {
          console.log(`  ${e instanceof Error ? e.message : e} — try again`);
        }
      }
    }
    console.log("\nNo unlabeled items left for this filter.");
  } finally {
    rl.close();
  }
}

async function main() {
  if (process.argv.includes("--init")) {
    if (fs.existsSync(GOLDEN_PATH))
      throw new Error(`${GOLDEN_PATH} already exists — not overwriting`);
    saveGoldenSet(GOLDEN_PATH, initGoldenSet(loadSnapshot(CORPUS_DIR), "lam"));
    console.log(`Created ${GOLDEN_PATH}`);
  } else if (process.argv.includes("--import")) {
    const file = argValue("--file") ?? DRAFT_QUERIES_PATH;
    const drafts = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "")
      .map((l, n) => {
        try {
          return parseDraftLine(l);
        } catch (e) {
          throw new Error(
            `${file}:${n + 1}: ${e instanceof Error ? e.message : e}`,
          );
        }
      });
    const res = importDrafts(
      loadGoldenSet(GOLDEN_PATH),
      drafts,
      loadSnapshot(CORPUS_DIR),
    );
    saveGoldenSet(GOLDEN_PATH, res.golden);
    console.log(
      `Imported ${res.added} new, skipped ${res.skipped} already present.`,
    );
  } else if (process.argv.includes("--label")) {
    await label(argValue("--city"));
  } else {
    console.error(
      "Usage: --init | --import [--file=path.jsonl] | --label [--city=key]",
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
