#!/usr/bin/env bash
#
# Fails fast, with a clear message, when mongodump (MongoDB Database Tools) is
# not on PATH. Used by .github/workflows/backup-mongo.yml right after the tools
# install and by backup-mongo.sh before it dumps, so a broken install is
# reported as such instead of as a vague backup failure.
if ! command -v mongodump >/dev/null 2>&1; then
  echo "❌ mongodump not found on PATH — MongoDB Database Tools are not installed." >&2
  echo "   See the 'Install MongoDB Database Tools' step in .github/workflows/backup-mongo.yml." >&2
  exit 1
fi
