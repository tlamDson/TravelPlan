import fs from "fs";
import path from "path";

/**
 * What Claude Code auto-loads for this repo: CLAUDE.md + every
 * `.claude/rules/**.md`, plus everything they @import, followed
 * recursively. Nested imports resolve relative to the importing file.
 * Used by `config/claude-docs-parity.test.ts` to enforce the context budget
 * and keep `.claude/reference/*` out of it.
 */

// `@path` at line start or after whitespace (so `a@b.com` is not an import).
const IMPORT_RE = /(?:^|\s)@([^\s`]+)/g;

function stripCode(source: string): string {
  return source.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

export function claudeImports(source: string): string[] {
  return [...stripCode(source).matchAll(IMPORT_RE)]
    .map((m) => m[1])
    .filter((p): p is string => !!p);
}

function listMarkdown(root: string, relDir: string): string[] {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) return listMarkdown(root, rel);
    return entry.name.endsWith(".md") ? [rel] : [];
  });
}

function toRepoRelative(root: string, abs: string): string | null {
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

/** Repo-relative target of `imp` written in `fromRel`, or null if outside. */
function resolveImport(
  root: string,
  fromRel: string,
  imp: string,
): string | null {
  if (imp.startsWith("~") || path.isAbsolute(imp)) return null;
  const abs = path.resolve(path.join(root, path.dirname(fromRel)), imp);
  const rel = toRepoRelative(root, abs);
  return rel !== null && fs.existsSync(abs) ? rel : null;
}

export function resolveAutoLoaded(root: string): {
  files: string[];
  unresolved: string[];
} {
  const seeds = ["CLAUDE.md", ...listMarkdown(root, ".claude/rules")];
  const seen = new Set<string>(seeds);
  const queue = [...seeds];
  const unresolved: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift() as string;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const imp of claudeImports(source)) {
      const target = resolveImport(root, file, imp);
      if (target === null) {
        unresolved.push(`${file} -> ${imp}`);
      } else if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  return { files: [...seen], unresolved };
}
