import fs from "fs";
import path from "path";

// Previous guard logic, moved verbatim: whole-line @imports of CLAUDE.md only.
export function claudeImports(source: string): string[] {
  const matches = source.matchAll(/^@(\S+)\s*$/gm);
  return [...matches].map((m) => m[1]).filter((p): p is string => !!p);
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

export function resolveAutoLoaded(root: string): {
  files: string[];
  unresolved: string[];
} {
  const imports = claudeImports(
    fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8"),
  );
  const files = [
    ...new Set([
      "CLAUDE.md",
      ...listMarkdown(root, ".claude/rules"),
      ...imports,
    ]),
  ];
  const unresolved = imports
    .filter((p) => !fs.existsSync(path.join(root, p)))
    .map((p) => `CLAUDE.md -> ${p}`);
  return { files, unresolved };
}
