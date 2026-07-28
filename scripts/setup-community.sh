#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RELAY_ENV_FILE:-${PROJECT_ROOT}/.env.community}"
PUBLIC_ORIGIN="${RELAY_PUBLIC_URL:-http://127.0.0.1:3100}"
SOURCE_CODE_URL="${RELAY_SOURCE_URL:-}"
RELAY_BIND_ADDRESS="${RELAY_BIND_ADDRESS:-127.0.0.1}"
RELAY_PORT="${RELAY_PORT:-3100}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

validate_public_origin() {
  local origin="$1"

  if [[ "${origin}" =~ [[:space:]] ]]; then
    echo "The public origin must be one absolute URL without whitespace." >&2
    exit 1
  fi

  if [[ "${origin}" =~ :([0-9]+)$ ]]; then
    validate_port "${BASH_REMATCH[1]}" "Public origin port"
  fi

  if [[ "${origin}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
    return
  fi
  if [[ "${origin}" =~ ^https://\[[0-9A-Fa-f:]+\](:[0-9]{1,5})?$ ]]; then
    return
  fi
  if [[ "${origin}" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$ ]]; then
    return
  fi

  echo "The public origin must be one credential-free HTTPS origin (or loopback HTTP)." >&2
  exit 1
}

validate_source_code_url() {
  local source_url="$1"
  if [[ -z "${source_url}" ]]; then
    return
  fi
  if [[ "${source_url}" =~ [[:space:]] ]] \
    || [[ ! "${source_url}" =~ ^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/%+-]+)*/?$ ]]; then
    echo "SOURCE_CODE_URL must be one credential-free HTTPS repository or archive URL." >&2
    exit 1
  fi
}

require_source_for_public_origin() {
  local public_origin="$1"
  local source_url="$2"
  if [[ "${public_origin}" == https://* && -z "${source_url}" ]]; then
    echo "An internet-facing AGPL installation requires SOURCE_CODE_URL." >&2
    echo "Set RELAY_SOURCE_URL to the exact Corresponding Source repository or archive." >&2
    exit 1
  fi
}

validate_port() {
  local port="$1"
  local name="$2"
  if [[ ! "${port}" =~ ^[0-9]+$ ]] || ((10#${port} < 1 || 10#${port} > 65535)); then
    echo "${name} must be an integer from 1 to 65535." >&2
    exit 1
  fi
}

validate_bind_address() {
  local address="$1"
  local -a octets=()
  local octet
  if [[ "${address}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    IFS='.' read -r -a octets <<<"${address}"
    for octet in "${octets[@]}"; do
      if ((10#${octet} > 255)); then
        echo "RELAY_BIND_ADDRESS contains an invalid IPv4 octet." >&2
        exit 1
      fi
    done
    return
  fi
  if [[ "${address}" =~ ^\[[0-9A-Fa-f:]+\]$ ]]; then
    return
  fi

  echo "RELAY_BIND_ADDRESS must be one IPv4 address or bracketed IPv6 address." >&2
  exit 1
}

environment_value() {
  local name="$1"
  awk -v name="${name}" 'index($0, name "=") == 1 { print substr($0, length(name) + 2); exit }' \
    "${ENV_FILE}"
}

create_environment() {
  local database_password
  local event_secret
  local payload_secret
  local temp_file

  database_password="$(openssl rand -hex 24)"
  event_secret="$(openssl rand -hex 32)"
  payload_secret="$(openssl rand -hex 32)"
  temp_file="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"

  {
    echo "RELAY_PORT=${RELAY_PORT}"
    echo "RELAY_BIND_ADDRESS=${RELAY_BIND_ADDRESS}"
    echo "RELAY_EDITION=community"
    echo "POSTGRES_DB=relay"
    echo "POSTGRES_USER=relay_app"
    echo "POSTGRES_PASSWORD=${database_password}"
    echo "DATABASE_URL=postgresql://relay_app:${database_password}@postgres:5432/relay"
    echo "PAYLOAD_SECRET=${payload_secret}"
    echo "EVENT_HASH_SECRET=${event_secret}"
    echo "PUBLIC_LINK_BASE_URL=${PUBLIC_ORIGIN}"
    echo "NEXT_PUBLIC_SITE_URL=${PUBLIC_ORIGIN}"
    echo "SPONSOR_URL="
    echo "SOURCE_CODE_URL=${SOURCE_CODE_URL}"
    echo "NEXT_PUBLIC_APP_ENV=Community"
    echo "NEXT_PUBLIC_DATABASE_LABEL=relay"
  } >"${temp_file}"

  chmod 600 "${temp_file}"
  mv "${temp_file}" "${ENV_FILE}"
}

validate_environment() {
  local configured_origin
  local configured_site_origin
  local event_secret
  local payload_secret
  local required_key
  local source_code_url

  if grep -Eq 'replace-with|change-me' "${ENV_FILE}"; then
    echo "${ENV_FILE} still contains placeholder credentials." >&2
    exit 1
  fi

  for required_key in \
    DATABASE_URL \
    EVENT_HASH_SECRET \
    NEXT_PUBLIC_SITE_URL \
    PAYLOAD_SECRET \
    POSTGRES_DB \
    POSTGRES_PASSWORD \
    POSTGRES_USER \
    PUBLIC_LINK_BASE_URL \
    RELAY_PORT \
    RELAY_EDITION; do
    if ! grep -q "^${required_key}=.\+" "${ENV_FILE}"; then
      echo "${ENV_FILE} is missing ${required_key}." >&2
      exit 1
    fi
  done

  if [[ "$(environment_value RELAY_EDITION)" != "community" ]]; then
    echo "${ENV_FILE} must set RELAY_EDITION=community for the Community setup helper." >&2
    exit 1
  fi

  payload_secret="$(environment_value PAYLOAD_SECRET)"
  event_secret="$(environment_value EVENT_HASH_SECRET)"
  if ((${#payload_secret} < 32 || ${#event_secret} < 32)); then
    echo "PAYLOAD_SECRET and EVENT_HASH_SECRET must each contain at least 32 characters." >&2
    exit 1
  fi

  configured_origin="$(environment_value PUBLIC_LINK_BASE_URL)"
  configured_site_origin="$(environment_value NEXT_PUBLIC_SITE_URL)"
  validate_public_origin "${configured_origin}"
  validate_public_origin "${configured_site_origin}"
  source_code_url="$(environment_value SOURCE_CODE_URL)"
  validate_source_code_url "${source_code_url}"
  require_source_for_public_origin "${configured_origin}" "${source_code_url}"

  validate_port "$(environment_value RELAY_PORT)" "RELAY_PORT"
  if [[ -n "$(environment_value RELAY_BIND_ADDRESS)" ]]; then
    validate_bind_address "$(environment_value RELAY_BIND_ADDRESS)"
  fi

  chmod 600 "${ENV_FILE}"
}

require_command docker
require_command openssl
docker compose version >/dev/null
validate_public_origin "${PUBLIC_ORIGIN}"
validate_source_code_url "${SOURCE_CODE_URL}"
require_source_for_public_origin "${PUBLIC_ORIGIN}" "${SOURCE_CODE_URL}"
validate_port "${RELAY_PORT}" "RELAY_PORT"
validate_bind_address "${RELAY_BIND_ADDRESS}"

if [[ -L "${ENV_FILE}" ]]; then
  echo "Refusing a symbolic-link environment file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  umask 077
  create_environment
  echo "Created ${ENV_FILE} with random credentials."
fi

validate_environment

cd "${PROJECT_ROOT}"
RELAY_ENV_FILE="${ENV_FILE}" docker compose --env-file "${ENV_FILE}" config --quiet
RELAY_ENV_FILE="${ENV_FILE}" docker compose --env-file "${ENV_FILE}" up --build --detach

echo
CONFIGURED_PUBLIC_ORIGIN="$(environment_value PUBLIC_LINK_BASE_URL)"
echo "Relay Community is starting at ${CONFIGURED_PUBLIC_ORIGIN}."
echo "On a new installation, create the first owner at ${CONFIGURED_PUBLIC_ORIGIN}/cms/create-first-user."
echo "Check status with: docker compose --env-file ${ENV_FILE} ps"
