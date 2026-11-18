import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * [Guard] Manual run 44203700946 dumped 87 MB, then the R2 upload failed with
 * "Credential access key has length 34, should be 32": the stored secret
 * carried 2 extra characters (quotes or CR/LF from how it was pasted).
 * backup-mongo.sh must sanitize the S3 variables and fail early, naming the
 * variable and its length (never its value).
 */

const REPO_ROOT = path.join(__dirname, "../../..");
const posix = (p: string) => p.split(path.sep).join("/");
const SANITIZE = posix(
  path.join(REPO_ROOT, "backend/scripts/sanitize-s3-env.sh"),
);
const BACKUP = posix(path.join(REPO_ROOT, "backend/scripts/backup-mongo.sh"));
// Absolute path: bash.exe on a Windows PATH can be WSL.
const bash =
  process.platform === "win32"
    ? "C:/Program Files/Git/bin/bash.exe"
    : "/bin/bash";

const KEY_ID = "a".repeat(32);
const SECRET = "b".repeat(64);
const R2 = "https://acct.r2.cloudflarestorage.com";

/** Source the helper, run `body`, print each S3 variable between brackets. */
const runSanitize = (env: Record<string, string>, body: string) =>
  spawnSync(
    bash,
    [
      "-c",
      `source "${SANITIZE}"; ${body}; rc=$?; ` +
        `for v in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET; do printf '%s=[%s]\n' "$v" "\${!v}"; done; exit $rc`,
    ],
    { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" },
  );

const baseEnv = {
  AWS_ACCESS_KEY_ID: KEY_ID,
  AWS_SECRET_ACCESS_KEY: SECRET,
  BACKUP_S3_ENDPOINT: R2,
  BACKUP_S3_BUCKET: "bucket",
};

describe("sanitize_s3_env", () => {
  it("strips one pair of surrounding double quotes", () => {
    const r = runSanitize(
      { ...baseEnv, AWS_ACCESS_KEY_ID: `"${KEY_ID}"` },
      "sanitize_s3_env",
    );
    expect(r.stdout).toContain(`AWS_ACCESS_KEY_ID=[${KEY_ID}]`);
  });

  it("strips one pair of surrounding single quotes", () => {
    const r = runSanitize(
      { ...baseEnv, AWS_SECRET_ACCESS_KEY: `'${SECRET}'` },
      "sanitize_s3_env",
    );
    expect(r.stdout).toContain(`AWS_SECRET_ACCESS_KEY=[${SECRET}]`);
  });

  it("strips trailing CR/LF and surrounding whitespace", () => {
    const r = runSanitize(
      {
        ...baseEnv,
        AWS_ACCESS_KEY_ID: `${KEY_ID}\r\n`,
        BACKUP_S3_ENDPOINT: `  ${R2}\n`,
        BACKUP_S3_BUCKET: `\tbucket \r`,
      },
      "sanitize_s3_env",
    );
    expect(r.stdout).toContain(`AWS_ACCESS_KEY_ID=[${KEY_ID}]`);
    expect(r.stdout).toContain(`BACKUP_S3_ENDPOINT=[${R2}]`);
    expect(r.stdout).toContain("BACKUP_S3_BUCKET=[bucket]");
  });

  it("strips quotes that sit behind a trailing CR", () => {
    const r = runSanitize(
      { ...baseEnv, BACKUP_S3_BUCKET: `"bucket"\r\n` },
      "sanitize_s3_env",
    );
    expect(r.stdout).toContain("BACKUP_S3_BUCKET=[bucket]");
  });

  it("strips only one pair of quotes and leaves inner or unmatched quotes", () => {
    const r = runSanitize(
      { ...baseEnv, BACKUP_S3_BUCKET: `""bucket""` },
      "sanitize_s3_env",
    );
    expect(r.stdout).toContain(`BACKUP_S3_BUCKET=["bucket"]`);
    const r2 = runSanitize(
      { ...baseEnv, BACKUP_S3_BUCKET: `"bucket` },
      "sanitize_s3_env",
    );
    expect(r2.stdout).toContain(`BACKUP_S3_BUCKET=["bucket]`);
  });

  it("leaves clean values untouched and keeps them exported", () => {
    const r = runSanitize(
      baseEnv,
      `sanitize_s3_env; bash -c 'echo "$AWS_ACCESS_KEY_ID"'`,
    );
    expect(r.stdout).toContain(KEY_ID);
    expect(r.stdout).toContain(`AWS_SECRET_ACCESS_KEY=[${SECRET}]`);
  });
});

describe("sanitize_s3_env zero-length values", () => {
  const sanitize = (env: Record<string, string>) =>
    runSanitize(env, "sanitize_s3_env");

  it.each([
    ["empty double quotes", '""'],
    ["empty single quotes", "''"],
    ["whitespace only", "  \t "],
    ["a bare CR/LF", "\r\n"],
    ["quotes around whitespace", '" "'],
  ])("fails naming the variable when it is configured as %s", (_n, raw) => {
    for (const name of [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "BACKUP_S3_ENDPOINT",
      "BACKUP_S3_BUCKET",
    ]) {
      const r = sanitize({ ...baseEnv, [name]: raw });
      expect(r.status, name).not.toBe(0);
      expect(r.stderr).toContain(name);
      expect(r.stderr).toContain("length 0");
    }
  });

  it("still treats a truly empty or unset variable as not configured", () => {
    expect(
      sanitize({ ...baseEnv, AWS_ACCESS_KEY_ID: "", BACKUP_S3_BUCKET: "" })
        .status,
    ).toBe(0);
  });
});

describe("validate_s3_credentials", () => {
  const validate = (env: Record<string, string>) =>
    runSanitize(env, "sanitize_s3_env; validate_s3_credentials");

  it("passes 32/64-character credentials on an R2 endpoint", () => {
    expect(validate(baseEnv).status).toBe(0);
  });

  it("fails naming AWS_ACCESS_KEY_ID and its length, without the value", () => {
    const bad = `${KEY_ID}XY`;
    const r = validate({ ...baseEnv, AWS_ACCESS_KEY_ID: bad });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("AWS_ACCESS_KEY_ID");
    expect(r.stderr).toContain("34");
    expect(r.stderr).not.toContain(bad);
  });

  it("fails naming AWS_SECRET_ACCESS_KEY and its length, without the value", () => {
    const bad = "c".repeat(63);
    const r = validate({ ...baseEnv, AWS_SECRET_ACCESS_KEY: bad });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("AWS_SECRET_ACCESS_KEY");
    expect(r.stderr).toContain("63");
    expect(r.stderr).not.toContain(bad);
  });

  it.each([
    "https://example.com/r2.cloudflarestorage.com",
    "https://r2.cloudflarestorage.com.evil.test",
    "https://evil.test/?x=r2.cloudflarestorage.com",
    "https://evil.test/#r2.cloudflarestorage.com",
    "https://notr2.cloudflarestorage.com",
    "https://r2.cloudflarestorage.com@evil.test",
    "https://evil-r2.cloudflarestorage.com",
    "https://r2.cloudflarestorage.com.evil.test.",
  ])("does not treat %s as an R2 endpoint", (endpoint) => {
    const r = validate({
      ...baseEnv,
      BACKUP_S3_ENDPOINT: endpoint,
      AWS_ACCESS_KEY_ID: "short",
    });
    expect(r.status).toBe(0);
  });

  it.each([
    "https://acct.r2.cloudflarestorage.com:443/bucket",
    "HTTPS://ACCT.R2.CLOUDFLARESTORAGE.COM",
    "https://r2.cloudflarestorage.com",
    "https://user:pw@acct.r2.cloudflarestorage.com/path?x=1",
    "https://acct.r2.cloudflarestorage.com.",
    "https://acct.r2.cloudflarestorage.com./bucket",
    "https://acct.r2.cloudflarestorage.com.:443",
    "https://r2.cloudflarestorage.com.",
  ])("still enforces lengths for the R2 endpoint %s", (endpoint) => {
    const r = validate({
      ...baseEnv,
      BACKUP_S3_ENDPOINT: endpoint,
      AWS_ACCESS_KEY_ID: "short",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("AWS_ACCESS_KEY_ID");
  });

  it("does not enforce lengths for a non-R2 endpoint", () => {
    const r = validate({
      ...baseEnv,
      BACKUP_S3_ENDPOINT: "https://s3.amazonaws.com",
      AWS_ACCESS_KEY_ID: "AKIA20CHARACTERKEY123",
    });
    expect(r.status).toBe(0);
  });
});

describe("backup-mongo.sh wiring", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-creds-"));
    const write = (name: string, body: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, body);
      fs.chmodSync(file, 0o755);
    };
    // Fake mongodump: marks that it ran and writes the requested archive.
    write(
      "mongodump",
      `#!/bin/sh
touch "${posix(dir)}/DUMPED"
` +
        `for a in "$@"; do case "$a" in --archive=*) echo data > "\${a#--archive=}";; esac; done
`,
    );
    // Fake aws: records the credentials and arguments it was called with.
    write(
      "aws",
      `#!/bin/sh\nprintf '%s\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$@" > "${posix(dir)}/AWS_CALL"\n`,
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const runBackup = (env: Record<string, string>) =>
    spawnSync(bash, [BACKUP], {
      env: {
        PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
        MONGO_URI: "mongodb://localhost/x",
        BACKUP_MIN_SIZE_BYTES: "1",
        ...baseEnv,
        ...env,
      },
      encoding: "utf8",
    });
  const dumped = () => fs.existsSync(path.join(dir, "DUMPED"));

  it("fails on a wrong-length key before dumping, without leaking it", () => {
    const r = runBackup({ AWS_ACCESS_KEY_ID: `"${KEY_ID}"XX` });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("AWS_ACCESS_KEY_ID");
    expect(r.stderr).toContain("36");
    expect(r.stderr + r.stdout).not.toContain(KEY_ID);
    expect(dumped()).toBe(false);
  });

  it("hands quote/CRLF-wrapped credentials to aws sanitized", () => {
    const r = runBackup({
      AWS_ACCESS_KEY_ID: `"${KEY_ID}"`,
      AWS_SECRET_ACCESS_KEY: `'${SECRET}'\r\n`,
      BACKUP_S3_ENDPOINT: ` ${R2}\r\n`,
      BACKUP_S3_BUCKET: `"bucket"`,
    });
    expect(r.status, r.stderr).toBe(0);
    const call = fs
      .readFileSync(path.join(dir, "AWS_CALL"), "utf8")
      .split("\n");
    expect(call[0]).toBe(KEY_ID);
    expect(call[1]).toBe(SECRET);
    expect(call).toContain(R2);
    expect(call.some((a) => a.startsWith("s3://bucket/mongo/"))).toBe(true);
    expect(r.stdout + r.stderr).not.toContain(SECRET);
  });

  it("fails instead of skipping when a configured credential is zero-length", () => {
    const r = runBackup({ AWS_SECRET_ACCESS_KEY: '""' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("AWS_SECRET_ACCESS_KEY");
    expect(r.stderr).toContain("length 0");
    expect(r.stdout).not.toContain("skipping");
    expect(dumped()).toBe(false);
  });

  it.each([
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "BACKUP_S3_ENDPOINT",
    "BACKUP_S3_BUCKET",
  ])("fails instead of skipping when only %s is empty or unset", (name) => {
    for (const r of [
      runBackup({ [name]: "" }),
      spawnSync(bash, [BACKUP], {
        env: {
          PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`,
          MONGO_URI: "mongodb://localhost/x",
          BACKUP_MIN_SIZE_BYTES: "1",
          ...Object.fromEntries(
            Object.entries(baseEnv).filter(([k]) => k !== name),
          ),
        },
        encoding: "utf8",
      }),
    ]) {
      expect(r.status, name).toBe(1);
      expect(r.stderr).toContain(name);
      expect(r.stdout).not.toContain("skipping");
      expect(r.stderr + r.stdout).not.toContain(KEY_ID);
      expect(r.stderr + r.stdout).not.toContain(SECRET);
      expect(dumped()).toBe(false);
    }
  });

  it("still skips with exit 0 when storage is not configured at all", () => {
    const r = runBackup({
      AWS_ACCESS_KEY_ID: "",
      AWS_SECRET_ACCESS_KEY: "",
      BACKUP_S3_ENDPOINT: "",
      BACKUP_S3_BUCKET: "",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("skipping");
    expect(dumped()).toBe(false);
  });
});
