#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RELAY_ENV_FILE:-${PROJECT_ROOT}/.env.community}"
BACKUP_DIR="${RELAY_BACKUP_DIR:-${PROJECT_ROOT}/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/relay-${TIMESTAMP}.dump"
TEMP_FILE=""

cleanup() {
  if [[ -n "${TEMP_FILE}" && -f "${TEMP_FILE}" ]]; then
    rm -f -- "${TEMP_FILE}"
  fi
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Required command not found: docker" >&2
  exit 1
fi

mkdir -p -- "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
umask 077
TEMP_FILE="$(mktemp "${BACKUP_DIR}/.relay-backup.XXXXXX")"
trap cleanup EXIT

cd "${PROJECT_ROOT}"
RELAY_ENV_FILE="${ENV_FILE}" docker compose --env-file "${ENV_FILE}" exec -T postgres \
  sh -ec 'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom' \
  >"${TEMP_FILE}"

mv "${TEMP_FILE}" "${BACKUP_FILE}"
TEMP_FILE=""
trap - EXIT

echo "Backup written to ${BACKUP_FILE}"
