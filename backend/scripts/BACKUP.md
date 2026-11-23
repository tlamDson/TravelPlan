# MongoDB Backup & Restore

`backup-mongo.sh` dumps `MONGO_URI` via `mongodump` and uploads the archive to an S3-compatible bucket (Cloudflare R2, S3, etc). Runs daily via `.github/workflows/backup-mongo.yml` at 01:00 UTC — one hour before `data-pipeline.yml`'s bulk-write slot (02:00 UTC on the 1st/15th), so that scheduled ETL job never runs against unprotected data.

> This file lives here (not `docs/`) because `docs/` is gitignored — a restore runbook that isn't tracked in git isn't discoverable when it's actually needed.

## 1. Setup — GitHub Repository Secrets

The workflow **soft-skips** (exits 0, no failure, no Discord alert) until these are set — it's safe to merge and let it run before a backup bucket exists.

| Secret                         | Notes                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| `MONGO_URI`                    | Already exists — same secret `data-pipeline.yml` uses.                |
| `BACKUP_S3_ENDPOINT`           | e.g. `https://<account-id>.r2.cloudflarestorage.com`                  |
| `BACKUP_S3_BUCKET`             | Bucket name. Use a dedicated bucket, not one shared with app data.    |
| `BACKUP_AWS_ACCESS_KEY_ID`     | R2 API token / S3 access key, scoped to only this bucket if possible. |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | Paired secret.                                                        |

Optional: `BACKUP_MIN_SIZE_BYTES` (default `10240` = 10 KiB) — the size-guard threshold. A dump smaller than this is treated as a failure ("mongodump succeeded but the archive is empty/wrong"), not trusted as a real backup. Tune this once you know the real size of a healthy dump — check the size of an early successful backup object in the bucket and set the threshold well below it.

## 2. Manual run / dry run

```bash
cd backend
MONGO_URI="mongodb://..." \
BACKUP_S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
BACKUP_S3_BUCKET="your-bucket" \
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
bash scripts/backup-mongo.sh
```

Requires `mongodump` (MongoDB Database Tools) and `aws` (AWS CLI v2, also works against R2 via `--endpoint-url` plus `--region auto`; the script adds that for an R2 endpoint) on your PATH locally.

To trigger a real run from CI without waiting for the daily cron: GitHub → Actions → "MongoDB Backup" → Run workflow.

## 3. Restore procedure

**Never restore into `travelplan_db`/`travelplan_staging` directly without a plan** — this overwrites live data. Always restore into a scratch database first, verify, then decide.

```bash
# 1. Download the archive from the bucket (adjust endpoint/bucket/key)
aws s3 cp s3://your-bucket/mongo/travelplan-<timestamp>.archive.gz ./restore-test.archive.gz \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com --region auto  # R2 rejects other regions

# 2. Restore into a throwaway database — never the real one on the first pass
mongorestore --uri "mongodb://localhost:27017" \
  --nsFrom 'travelplan_db.*' --nsTo 'travelplan_restore_test.*' \
  --archive=./restore-test.archive.gz --gzip

# 3. Verify — spot-check a few collections have the expected document counts
mongosh --eval '
  const db = connect("mongodb://localhost:27017/travelplan_restore_test");
  print("trips:", db.trips.countDocuments());
  print("users:", db.users.countDocuments());
'

# 4. Only after verification, if this is a real disaster recovery: restore
# into the real database name, ideally against a fresh/empty cluster, never
# on top of a live one without `--drop` and a clear maintenance window.
```

## 4. Restore drill log

Run the restore procedure above against a real backup periodically (recommended: after the first few backups exist, then quarterly) and log it here — a backup that has never been restored is unverified, not a real backup.

| Date                                                                       | Who | Archive tested | Result | Notes |
| -------------------------------------------------------------------------- | --- | -------------- | ------ | ----- |
| _(none yet — first backup needs `BACKUP_S3_*` secrets configured, see §1)_ |     |                |        |       |
