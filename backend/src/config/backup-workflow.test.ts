import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * [Guard] The daily MongoDB Backup workflow must not depend on the runner's
 * Ubuntu codename. It failed 60/60 runs once `ubuntu-latest` became 26.04
 * ("resolute"): repo.mongodb.org has no apt repo for it, so
 * `apt-get update` exited 100 and no backup was ever taken.
 */

const REPO_ROOT = path.join(__dirname, "../../..");
const WORKFLOW = fs.readFileSync(
  path.join(REPO_ROOT, ".github/workflows/backup-mongo.yml"),
  "utf8",
);
const REQUIRE_SCRIPT = path.join(
  REPO_ROOT,
  "backend/scripts/require-mongodump.sh",
);
const BACKUP_SCRIPT = fs.readFileSync(
  path.join(REPO_ROOT, "backend/scripts/backup-mongo.sh"),
  "utf8",
);

describe("backup-mongo.yml", () => {
  it("pins the runner image instead of ubuntu-latest", () => {
    expect(WORKFLOW).toMatch(/runs-on:\s*ubuntu-24\.04\s*$/m);
    expect(WORKFLOW).not.toMatch(/ubuntu-latest/);
  });

  it("does not use the codename-keyed MongoDB apt repository", () => {
    expect(WORKFLOW).not.toMatch(/lsb_release/);
    expect(WORKFLOW).not.toMatch(/repo\.mongodb\.org/);
    expect(WORKFLOW).not.toMatch(/apt-get/);
  });

  it("installs mongodb-database-tools from a pinned tgz with a checksum", () => {
    expect(WORKFLOW).toMatch(
      /fastdl\.mongodb\.org\/tools\/db\/mongodb-database-tools-ubuntu2404-x86_64-\d+\.\d+\.\d+\.tgz/,
    );
    expect(WORKFLOW).toMatch(/sha256sum\s+-c/);
    expect(WORKFLOW).toMatch(/[0-9a-f]{64}/);
  });

  it("fails fast when mongodump is missing, before the backup runs", () => {
    const check = WORKFLOW.indexOf("require-mongodump.sh");
    const run = WORKFLOW.indexOf("scripts/backup-mongo.sh");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(run);
  });

  it("keeps the Discord alert on failure", () => {
    expect(WORKFLOW).toMatch(/if:\s*failure\(\)/);
    expect(WORKFLOW).toContain("DISCORD_WEBHOOK");
  });
});

describe("backup-mongo.sh", () => {
  it("checks for mongodump before dumping", () => {
    const check = BACKUP_SCRIPT.indexOf("require-mongodump.sh");
    const dump = BACKUP_SCRIPT.indexOf("mongodump --uri");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(dump);
  });
});

describe("require-mongodump.sh", () => {
  let dir: string;
  // Absolute path: the child gets a PATH without mongodump, so bash itself
  // cannot be looked up through it (and bash.exe on a Windows PATH can be WSL).
  const bash =
    process.platform === "win32"
      ? "C:/Program Files/Git/bin/bash.exe"
      : "/bin/bash";

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mongodump-check-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = () =>
    spawnSync(bash, [REQUIRE_SCRIPT], {
      env: { PATH: dir },
      encoding: "utf8",
    });

  it("exits non-zero with a clear message when mongodump is not on PATH", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("mongodump not found");
  });

  it("exits 0 when mongodump is on PATH", () => {
    const fake = path.join(dir, "mongodump");
    fs.writeFileSync(fake, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(fake, 0o755);
    expect(run().status).toBe(0);
  });
});
