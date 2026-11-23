import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * [Guard] T-0002: scheduled runs 44848201156 (2026-11-21) onward dumped the
 * database, then `aws s3 cp` failed with InvalidRegionName 'us-west-2'.
 * backup-mongo.sh passed no region, so the AWS CLI fell back to the runner
 * host's region (GitHub now provisions runners on AWS; "Region: us-west-2" in
 * the job header). R2 rejects that; it needs region 'auto'.
 *
 * The fake `aws` below emulates R2 from the real job logs saved in
 * src/test/fixtures/backup/: it accepts the regions R2 listed in its error,
 * plus us-east-1 (run 44651137315 uploaded fine from a us-east-1 runner), and
 * otherwise prints the real error line. Region resolution follows the AWS CLI
 * order: --region, AWS_REGION, AWS_DEFAULT_REGION, then the host's region.
 */

const REPO_ROOT = path.join(__dirname, "../../..");
const posix = (p: string) => p.split(path.sep).join("/");
const BACKUP = posix(path.join(REPO_ROOT, "backend/scripts/backup-mongo.sh"));
const FIXTURES = path.join(__dirname, "../test/fixtures/backup");
const FAIL_LOG = fs.readFileSync(
  path.join(FIXTURES, "r2-invalid-region-run-45092700561.log"),
  "utf8",
);
const OK_LOG = fs.readFileSync(
  path.join(FIXTURES, "r2-upload-ok-us-east-1-run-44651137315.log"),
  "utf8",
);
const bash =
  process.platform === "win32"
    ? "C:/Program Files/Git/bin/bash.exe"
    : "/bin/bash";

const hostRegion = (log: string) => /Region: (\S+)/.exec(log)?.[1] ?? "";
const R2_ERROR = /upload failed: .*$/m.exec(FAIL_LOG)?.[0] ?? "";
const R2_REGIONS = [
  ...(/Must be one of: (.*)$/m.exec(FAIL_LOG)?.[1] ?? "").split(/,\s*/),
  hostRegion(OK_LOG),
];

const baseEnv = {
  MONGO_URI: "mongodb://localhost/x",
  BACKUP_MIN_SIZE_BYTES: "1",
  AWS_ACCESS_KEY_ID: "a".repeat(32),
  AWS_SECRET_ACCESS_KEY: "b".repeat(64),
  BACKUP_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  BACKUP_S3_BUCKET: "bucket",
};

describe("backup-mongo.sh upload region", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-region-"));
    const write = (name: string, body: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, body);
      fs.chmodSync(file, 0o755);
    };
    fs.writeFileSync(path.join(dir, "R2_ERROR"), `${R2_ERROR}\n`);
    write(
      "mongodump",
      `#!/bin/sh\nfor a in "$@"; do case "$a" in --archive=*) echo data > "\${a#--archive=}";; esac; done\n`,
    );
    write(
      "aws",
      `#!/bin/sh
region="\${AWS_REGION:-\${AWS_DEFAULT_REGION:-$HOST_REGION}}"
prev=""
for a in "$@"; do [ "$prev" = "--region" ] && region="$a"; prev="$a"; done
printf '%s\\n' "$region" > "${posix(dir)}/REGION"
case " ${R2_REGIONS.join(" ")} " in *" $region "*) exit 0;; esac
sed "s/'us-west-2'/'$region'/" "${posix(dir)}/R2_ERROR" >&2
exit 1
`,
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const runBackup = (env: Record<string, string>) =>
    spawnSync(bash, [BACKUP], {
      env: {
        PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
        ...baseEnv,
        ...env,
      },
      encoding: "utf8",
    });
  const usedRegion = () =>
    fs.readFileSync(path.join(dir, "REGION"), "utf8").trim();

  it("uploads to R2 from a us-west-2 runner (the failing nightly)", () => {
    const r = runBackup({ HOST_REGION: hostRegion(FAIL_LOG) });
    expect(r.stderr).not.toContain("InvalidRegionName");
    expect(r.status, r.stderr).toBe(0);
    expect(usedRegion()).toBe("auto");
  });

  it("uses region auto for R2 even when the environment sets another region", () => {
    const r = runBackup({
      HOST_REGION: "us-west-2",
      AWS_REGION: "eu-central-1",
      AWS_DEFAULT_REGION: "us-west-2",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(usedRegion()).toBe("auto");
  });

  it("leaves the region to the AWS CLI for a non-R2 endpoint", () => {
    const r = runBackup({
      HOST_REGION: "us-east-1",
      AWS_DEFAULT_REGION: "us-east-1",
      BACKUP_S3_ENDPOINT: "https://s3.amazonaws.com",
    });
    expect(r.status, r.stderr).toBe(0);
    expect(usedRegion()).toBe("us-east-1");
  });
});
