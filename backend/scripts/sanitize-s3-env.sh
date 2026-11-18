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

# A variable that is unset or empty is "not configured" (GitHub passes a
# missing secret as ""). One that is set but empty after cleaning (e.g. `""` or
# a bare newline) is a broken secret: fail instead of silently skipping.
sanitize_s3_env() {
  local name value bad=0
  for name in "${S3_ENV_VARS[@]}"; do
    value="${!name:-}"
    [ -z "$value" ] && continue
    _s3_clean "$value" value
    if [ -z "$value" ]; then
      echo "❌ ${name} is set but has length 0 after removing whitespace and quotes (value not shown)." >&2
      bad=1
      continue
    fi
    export "$name=$value"
  done
  return "$bad"
}

# Returns 0 when all S3 variables are set, 2 when none is (storage not
# configured: the caller skips), and 1 with a message naming each missing
# variable when only some are set (a broken config must not skip silently).
s3_config_state() {
  local name missing=()
  for name in "${S3_ENV_VARS[@]}"; do
    [ -z "${!name:-}" ] && missing+=("$name")
  done
  [ "${#missing[@]}" -eq 0 ] && return 0
  [ "${#missing[@]}" -eq "${#S3_ENV_VARS[@]}" ] && return 2
  echo "❌ Backup storage is partly configured; empty or unset: ${missing[*]}." >&2
  return 1
}

# True when the endpoint's host is r2.cloudflarestorage.com or a subdomain.
# Only the host part of the URL counts: path, query, fragment, userinfo and
# port are ignored, and a final DNS root dot ("host.") is the same host.
_s3_endpoint_is_r2() {
  local rest="${1#*://}" host
  rest="${rest%%[/?#]*}"
  rest="${rest##*@}"
  host="${rest%%:*}"
  host="${host%.}"
  host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
  [ "$host" = "r2.cloudflarestorage.com" ] || [[ "$host" == *.r2.cloudflarestorage.com ]]
}

# R2 access key ids are 32 characters and secrets 64. Reports the variable and
# its length only.
validate_s3_credentials() {
  _s3_endpoint_is_r2 "${BACKUP_S3_ENDPOINT:-}" || return 0
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
