import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { resolveAutoLoaded } from "../test/claude-context";

/**
 * [Guard] Claude Code session context for this repo.
 *
 * CLAUDE.md + `.claude/rules/*.md` are loaded into EVERY session, so they
 * must stay small (rules only). Knowledge that is only needed for some
 * tasks (pitfalls, tech debt, deploy, test infra, UI, browser debugging)
 * lives in `.claude/reference/` and is read on demand — CLAUDE.md keeps a
 * table of which file holds what. This guard stops the old drift back:
 * ~118 KB of PR history auto-loaded into every session.
 *
 * "Auto-loaded" = CLAUDE.md + every `.claude/rules/**.md`, plus everything
 * they @import, followed recursively (Claude Code resolves nested imports
 * relative to the importing file) — so a rule file cannot pull reference
 * docs back in, or blow the budget, through a second-level import.
 */

const REPO_ROOT = path.join(__dirname, "../../..");
const AUTOLOAD_BUDGET_BYTES = 24_000;
const REFERENCE_FILES = [
  "pitfalls.md",
  "tech-debt.md",
  "deploy-ops.md",
  "test-infra.md",
  "ui-design.md",
  "debug-browser.md",
];
// Directories under .claude/ whose markdown may point at rules/reference.
const CLAUDE_DOC_DIRS = ["agents", "commands", "skills", "rules", "reference"];

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function listMarkdown(relDir: string): string[] {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) return listMarkdown(rel);
    return entry.name.endsWith(".md") ? [rel] : [];
  });
}

function autoLoadedFiles(): string[] {
  return resolveAutoLoaded(REPO_ROOT).files;
}

function docFilesWithPointers(): string[] {
  return [
    "CLAUDE.md",
    "README.md",
    ...CLAUDE_DOC_DIRS.flatMap((d) => listMarkdown(`.claude/${d}`)),
  ];
}

describe("[Guard] CLAUDE.md + .claude/rules stay a small rule set", () => {
  it("resolves every @import reachable from CLAUDE.md and rules", () => {
    expect(resolveAutoLoaded(REPO_ROOT).unresolved).toEqual([]);
  });

  it(`keeps auto-loaded context under ${AUTOLOAD_BUDGET_BYTES} bytes`, () => {
    const sizes = autoLoadedFiles().map((f) => ({
      file: f,
      bytes: Buffer.byteLength(read(f), "utf8"),
    }));
    const total = sizes.reduce((sum, s) => sum + s.bytes, 0);
    expect(total, JSON.stringify(sizes)).toBeLessThanOrEqual(
      AUTOLOAD_BUDGET_BYTES,
    );
  });

  it("never auto-loads .claude/reference/*", () => {
    const loaded = autoLoadedFiles().filter((f) =>
      f.startsWith(".claude/reference/"),
    );
    expect(loaded).toEqual([]);
  });

  it("states the session, TDD and file-size rules", () => {
    const claude = read("CLAUDE.md");
    expect(claude).toContain("RESULT:");
    expect(claude).toContain("EnterWorktree");
    expect(claude).toContain("## RED");
    expect(claude).toMatch(/300 lines/);
    expect(claude).toContain("runs.csv");
    expect(claude).toMatch(/simulated/);
  });

  it("no longer carries the hard Rule of 200 in Claude docs", () => {
    const offenders = docFilesWithPointers().filter((f) =>
      /Rule of 200/i.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("[Guard] .claude/reference holds on-demand knowledge", () => {
  it.each(REFERENCE_FILES)(
    "has .claude/reference/%s listed in CLAUDE.md",
    (file) => {
      expect(exists(`.claude/reference/${file}`)).toBe(true);
      expect(read("CLAUDE.md")).toContain(`.claude/reference/${file}`);
    },
  );

  it("has no dangling .claude/rules|reference pointers in docs", () => {
    const dangling = docFilesWithPointers().flatMap((file) => {
      const refs = read(file).matchAll(
        /\.claude\/(?:rules|reference)\/[a-z0-9-]+\.md/g,
      );
      return [...refs]
        .map((m) => m[0])
        .filter((ref) => !exists(ref))
        .map((ref) => `${file} -> ${ref}`);
    });
    expect(dangling).toEqual([]);
  });
});

describe("[Guard] Claude docs are written in English", () => {
  // Vietnamese letters (precomposed, with tone marks) plus the d-with-stroke letter.
  const VIETNAMESE =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/u;

  it("has no Vietnamese text in CLAUDE.md or .claude markdown", () => {
    const offenders = docFilesWithPointers()
      .filter((f) => f !== "README.md")
      .flatMap((file) =>
        read(file)
          .split(/\r?\n/)
          .flatMap((line, i) =>
            VIETNAMESE.test(line) ? [`${file}:${i + 1}`] : [],
          ),
      );
    expect(offenders).toEqual([]);
  });
});

describe("[Guard] code-reviewer agent covers Python and data", () => {
  it("checks ruff/pytest, pinned deps and PII hashing", () => {
    const reviewer = read(".claude/agents/code-reviewer.md");
    expect(reviewer).toMatch(/ruff/);
    expect(reviewer).toMatch(/pytest/);
    expect(reviewer).toMatch(/pin/i);
    expect(reviewer).toMatch(/PII/);
    expect(reviewer).toMatch(/runs\.csv/);
  });
});
