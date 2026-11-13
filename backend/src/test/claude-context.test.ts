import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeImports, resolveAutoLoaded } from "./claude-context";

let root: string;

function write(rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-context-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("claudeImports", () => {
  it("finds whole-line and inline @imports", () => {
    const src = "@.claude/rules/a.md\nSee @docs/b.md for more.\n";
    expect(claudeImports(src)).toEqual([".claude/rules/a.md", "docs/b.md"]);
  });

  it("ignores @ inside code spans, code fences and emails", () => {
    const src = [
      "Package `@travelplan/shared` and `@clerk/express`.",
      "```",
      "@.claude/reference/x.md",
      "```",
      "Mail a@b.com",
    ].join("\n");
    expect(claudeImports(src)).toEqual([]);
  });
});

describe("resolveAutoLoaded", () => {
  it("follows @imports nested inside rules files", () => {
    write("CLAUDE.md", "@.claude/rules/a.md\n");
    write(".claude/rules/a.md", "Details: @../reference/x.md\n");
    write(".claude/reference/x.md", "big knowledge\n");

    const { files, unresolved } = resolveAutoLoaded(root);

    expect(files).toContain(".claude/reference/x.md");
    expect(unresolved).toEqual([]);
  });

  it("seeds every rules file, even ones CLAUDE.md does not import", () => {
    write("CLAUDE.md", "no imports\n");
    write(".claude/rules/sub/b.md", "@../../notes/n.md\n");
    write(".claude/notes/n.md", "@deep.md\n");
    write(".claude/notes/deep.md", "leaf\n");

    const { files } = resolveAutoLoaded(root);

    expect(files.sort()).toEqual(
      [
        "CLAUDE.md",
        ".claude/rules/sub/b.md",
        ".claude/notes/n.md",
        ".claude/notes/deep.md",
      ].sort(),
    );
  });

  it("terminates on import cycles", () => {
    write("CLAUDE.md", "@a.md\n");
    write("a.md", "@CLAUDE.md\n");

    expect(resolveAutoLoaded(root).files.sort()).toEqual(["CLAUDE.md", "a.md"]);
  });

  it("reports missing, home, absolute and outside-repo imports", () => {
    const absolute = path.join(os.tmpdir(), "elsewhere.md");
    write(
      "CLAUDE.md",
      `@missing.md\n@~/.claude/personal.md\n@${absolute}\n@../outside.md\n`,
    );

    const { unresolved } = resolveAutoLoaded(root);

    expect(unresolved).toEqual([
      "CLAUDE.md -> missing.md",
      "CLAUDE.md -> ~/.claude/personal.md",
      `CLAUDE.md -> ${absolute}`,
      "CLAUDE.md -> ../outside.md",
    ]);
  });
});
