import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tinySnapshot } from "../../test/rag-eval-fixtures";
import { initGoldenSet } from "./golden-labeling";
import { goldenSha, loadGoldenSet, saveGoldenSet } from "./golden-io";

const dirs: string[] = [];
afterEach(() =>
  dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
);

describe("golden-io", () => {
  it("saves and loads a golden set, leaving no temp file behind", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-"));
    dirs.push(dir);
    const file = path.join(dir, "nested", "golden.json");
    const g = initGoldenSet(tinySnapshot(), "lam");
    saveGoldenSet(file, g);
    expect(loadGoldenSet(file)).toEqual(g);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["golden.json"]);
  });

  it("names the init command when the file is missing", () => {
    expect(() =>
      loadGoldenSet(path.join(os.tmpdir(), "nope-golden.json")),
    ).toThrow(/--init/);
  });

  it("goldenSha changes when any label changes", () => {
    const g = initGoldenSet(tinySnapshot(), "lam");
    const h = goldenSha(g);
    expect(goldenSha({ ...g, labeler: "someone" })).not.toBe(h);
    expect(goldenSha(structuredClone(g))).toBe(h);
  });
});
