import fs from "fs";
import path from "path";

const INDEX_CSS_PATH = path.join(__dirname, "../index.css");

function extractBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`Could not find "${selector} {" block in index.css`);
  }
  const braceStart = source.indexOf("{", start);
  const braceEnd = source.indexOf("}", braceStart);
  return source.slice(braceStart + 1, braceEnd);
}

/**
 * Reads one CSS custom property's raw value (e.g. "239 84% 67%") out of
 * index.css's :root or .dark block, for tests that assert a TS constant
 * mirrors the CSS token instead of duplicating the number with no guard.
 */
export function readCssVar(mode: "root" | "dark", varName: string): string {
  const cssSource = fs.readFileSync(INDEX_CSS_PATH, "utf8");
  const block = extractBlock(cssSource, mode === "root" ? ":root" : ".dark");
  const match = block.match(new RegExp(`--${varName}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(
      `--${varName} not found in .${mode === "root" ? ":root" : "dark"} block`,
    );
  }
  return match[1].trim();
}
