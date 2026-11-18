#!/usr/bin/env bash
#
# Sourced by backup-mongo.sh. Secrets pasted into GitHub often carry stray
# quotes or a CR/LF, which makes the S3 upload fail with e.g. "Credential
# access key has length 34, should be 32". Never prints a credential value.

S3_ENV_VARS=(AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET)

# Strip whitespace/CR/LF, then one matching pair of surrounding quotes, then
# whitespace again. Result goes to the variable named by $2.
_s3_clean() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  if [ "${#v}" -ge 2 ]; then
    local first="${v:0:1}" last="${v: -1}"
    if [ "$first" = "$last" ] && { [ "$first" = '"' ] || [ "$first" = "'" ]; }; then
      v="${v:1:${#v}-2}"
      v="${v#"${v%%[![:space:]]*}"}"
      v="${v%"${v##*[![:space:]]}"}"
    fi
  fi
  printf -v "$2" '%s' "$v"
}

sanitize_s3_env() {
  local name value
  for name in "${S3_ENV_VARS[@]}"; do
    value="${!name:-}"
    [ -z "$value" ] && continue
    _s3_clean "$value" value
    export "$name=$value"
  done
}

# R2 access key ids are 32 characters and secrets 64. Reports the variable and
# its length only.
validate_s3_credentials() {
  case "${BACKUP_S3_ENDPOINT:-}" in
    *r2.cloudflarestorage.com*) ;;
    *) return 0 ;;
  esac
  local bad=0
  if [ "${#AWS_ACCESS_KEY_ID}" -ne 32 ]; then
    echo "❌ AWS_ACCESS_KEY_ID has length ${#AWS_ACCESS_KEY_ID}, expected 32 for an R2 endpoint (value not shown)." >&2
    bad=1
  fi
  if [ "${#AWS_SECRET_ACCESS_KEY}" -ne 64 ]; then
    echo "❌ AWS_SECRET_ACCESS_KEY has length ${#AWS_SECRET_ACCESS_KEY}, expected 64 for an R2 endpoint (value not shown)." >&2
    bad=1
  fi
  return "$bad"
}
