import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

/**
 * [Guard] GitHub community profile files.
 *
 * They live in `.github/` (GitHub reads them there) so the repo root keeps
 * only README.md, CLAUDE.md and DEVELOPMENT.md. The repo is public, so these
 * files must never carry personal contact data (email, phone number).
 */

const REPO_ROOT = path.join(__dirname, "../../..");
const COMMUNITY_FILES = [
  ".github/CODE_OF_CONDUCT.md",
  ".github/CONTRIBUTING.md",
  ".github/SECURITY.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/pull_request_template.md",
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /\+?\d[\d\s().-]{8,}\d/;

const read = (rel: string) =>
  fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("GitHub community files", () => {
  it.each(COMMUNITY_FILES)(
    "%s exists and has no personal contact data",
    (rel) => {
      expect(fs.existsSync(path.join(REPO_ROOT, rel))).toBe(true);
      const text = read(rel);
      expect(text.match(EMAIL)).toBeNull();
      expect(text.match(PHONE)).toBeNull();
    },
  );

  it("code of conduct is Contributor Covenant 2.1 with a private GitHub contact", () => {
    const text = read(".github/CODE_OF_CONDUCT.md");
    expect(text).toContain("Contributor Covenant");
    expect(text).toContain("version 2.1");
    expect(text).toContain("@tlamDson");
  });

  it("contributing guide points to DEVELOPMENT.md and PRs into develop", () => {
    const text = read(".github/CONTRIBUTING.md");
    expect(text).toContain("DEVELOPMENT.md");
    expect(text).toMatch(/into `develop`/);
  });

  it("security policy uses private vulnerability reporting", () => {
    expect(read(".github/SECURITY.md")).toContain("security/advisories/new");
  });

  it("adds no new markdown files to the repo root", () => {
    const rootMd = fs.readdirSync(REPO_ROOT).filter((f) => f.endsWith(".md"));
    expect(rootMd.sort()).toEqual(["CLAUDE.md", "DEVELOPMENT.md", "README.md"]);
  });
});
