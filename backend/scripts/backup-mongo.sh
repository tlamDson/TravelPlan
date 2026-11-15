#!/usr/bin/env bash
#
# Dumps MONGO_URI via mongodump and uploads the archive to an S3-compatible
# bucket (Cloudflare R2, S3, etc). Designed to run from GitHub Actions
# (.github/workflows/backup-mongo.yml) but works locally too.
#
# Required:
#   MONGO_URI               — same secret data-pipeline.yml already uses
# Required for upload (soft-skip with exit 0 if any are missing — lets this
# run safely before a backup bucket has been provisioned, see tech-defaults.md
# "Manual steps you must do" section):
#   BACKUP_S3_ENDPOINT       — e.g. https://<account-id>.r2.cloudflarestorage.com
#   BACKUP_S3_BUCKET         — bucket name
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
# Optional:
#   BACKUP_MIN_SIZE_BYTES    — guard threshold, default 10240 (10 KiB).
#                              A dump smaller than this is treated as a
#                              failure ("succeeded but empty"), not a success.
set -euo pipefail

if [ -z "${MONGO_URI:-}" ]; then
  echo "❌ MONGO_URI is not set — this is a hard requirement, failing." >&2
  exit 1
fi

if [ -z "${BACKUP_S3_ENDPOINT:-}" ] || [ -z "${BACKUP_S3_BUCKET:-}" ] || \
   [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "⏭  Backup storage not configured (BACKUP_S3_ENDPOINT/BACKUP_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY) — skipping, not failing."
  exit 0
fi

MIN_SIZE_BYTES="${BACKUP_MIN_SIZE_BYTES:-10240}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_PATH="$(mktemp -d)/travelplan-${TIMESTAMP}.archive.gz"

echo "📦 Dumping MongoDB to ${ARCHIVE_PATH}..."
mongodump --uri "$MONGO_URI" --archive="$ARCHIVE_PATH" --gzip

ACTUAL_SIZE_BYTES="$(stat -c%s "$ARCHIVE_PATH" 2>/dev/null || stat -f%z "$ARCHIVE_PATH")"
echo "📏 Archive size: ${ACTUAL_SIZE_BYTES} bytes (minimum: ${MIN_SIZE_BYTES})"

if [ "$ACTUAL_SIZE_BYTES" -lt "$MIN_SIZE_BYTES" ]; then
  echo "❌ Archive is smaller than BACKUP_MIN_SIZE_BYTES — mongodump likely" >&2
  echo "   succeeded against an empty/wrong database rather than genuinely" >&2
  echo "   failing. Treating this as a failure so it isn't silently trusted." >&2
  rm -f "$ARCHIVE_PATH"
  exit 1
fi

DEST="s3://${BACKUP_S3_BUCKET}/mongo/travelplan-${TIMESTAMP}.archive.gz"
echo "☁️  Uploading to ${DEST}..."
aws s3 cp "$ARCHIVE_PATH" "$DEST" --endpoint-url "$BACKUP_S3_ENDPOINT"

rm -f "$ARCHIVE_PATH"
echo "✅ Backup complete: ${DEST} (${ACTUAL_SIZE_BYTES} bytes)"
