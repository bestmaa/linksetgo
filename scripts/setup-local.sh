#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED_POSTGRES_DIR="${RELAY_SHARED_POSTGRES_DIR:-/home/beste/project/_shared/postgres}"
DATABASE_NAME="dynamic_deeplinking_dev"
DATABASE_ROLE="dynamic_deeplinking_app"
CREDENTIAL_FILE="${SHARED_POSTGRES_DIR}/credentials/${DATABASE_NAME}.env"
TEST_DATABASE_NAME="dynamic_deeplinking_test"
TEST_DATABASE_ROLE="dynamic_deeplinking_test_app"
TEST_CREDENTIAL_FILE="${SHARED_POSTGRES_DIR}/credentials/${TEST_DATABASE_NAME}.env"
ENV_FILE="${PROJECT_ROOT}/.env"
TEST_ENV_FILE="${PROJECT_ROOT}/.env.test.local"

append_env_if_missing() {
  local file_path="$1"
  local key="$2"
  local value="$3"

  if ! grep -q "^${key}=" "${file_path}"; then
    printf '%s=%s\n' "${key}" "${value}" >>"${file_path}"
  fi
}

ensure_secret_length() {
  local file_path="$1"
  local key="$2"
  local current_value
  local replacement
  local temp_file

  current_value="$(sed -n "s/^${key}=//p" "${file_path}" | head -n 1)"
  if (( ${#current_value} >= 32 )); then
    return
  fi

  replacement="$(openssl rand -hex 32)"
  temp_file="$(mktemp)"
  awk -v key="${key}" -v value="${replacement}" '
    index($0, key "=") == 1 { print key "=" value; next }
    { print }
  ' "${file_path}" >"${temp_file}"
  chmod 600 "${temp_file}"
  mv "${temp_file}" "${file_path}"
}

if [[ ! -x "${SHARED_POSTGRES_DIR}/scripts/bootstrap.sh" ]]; then
  echo "Shared PostgreSQL tooling was not found at ${SHARED_POSTGRES_DIR}." >&2
  exit 1
fi

"${SHARED_POSTGRES_DIR}/scripts/bootstrap.sh"
"${SHARED_POSTGRES_DIR}/scripts/create-project-db.sh" \
  "${DATABASE_NAME}" \
  "${DATABASE_ROLE}"
"${SHARED_POSTGRES_DIR}/scripts/create-project-db.sh" \
  "${TEST_DATABASE_NAME}" \
  "${TEST_DATABASE_ROLE}"

if [[ ! -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CREDENTIAL_FILE}"
  set +a

  umask 077
  {
    echo "DATABASE_URL=${DATABASE_URL}"
    echo "PAYLOAD_SECRET=$(openssl rand -hex 32)"
    echo "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100"
    echo "NEXT_PUBLIC_APP_ENV=Development"
    echo "NEXT_PUBLIC_DATABASE_LABEL=${DATABASE_NAME}"
    echo "PUBLIC_LINK_BASE_URL=http://127.0.0.1:3100"
    echo "EVENT_HASH_SECRET=$(openssl rand -hex 32)"
    echo "SEED_ADMIN_EMAIL=admin@relay.local"
    echo "SEED_ADMIN_PASSWORD=$(openssl rand -hex 12)"
  } >"${ENV_FILE}"
fi

chmod 600 "${ENV_FILE}"
append_env_if_missing "${ENV_FILE}" "NEXT_PUBLIC_APP_URL" "http://127.0.0.1:3100"
append_env_if_missing "${ENV_FILE}" "NEXT_PUBLIC_APP_ENV" "Development"
append_env_if_missing "${ENV_FILE}" "NEXT_PUBLIC_DATABASE_LABEL" "${DATABASE_NAME}"
append_env_if_missing "${ENV_FILE}" "PUBLIC_LINK_BASE_URL" "http://127.0.0.1:3100"
append_env_if_missing "${ENV_FILE}" "EVENT_HASH_SECRET" "$(openssl rand -hex 32)"
ensure_secret_length "${ENV_FILE}" "PAYLOAD_SECRET"
ensure_secret_length "${ENV_FILE}" "EVENT_HASH_SECRET"

if [[ ! -f "${TEST_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${TEST_CREDENTIAL_FILE}"
  set +a

  umask 077
  {
    echo "DATABASE_URL=${DATABASE_URL}"
    echo "PAYLOAD_SECRET=$(openssl rand -hex 32)"
    echo "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100"
    echo "NEXT_PUBLIC_APP_ENV=Test"
    echo "NEXT_PUBLIC_DATABASE_LABEL=${TEST_DATABASE_NAME}"
    echo "PUBLIC_LINK_BASE_URL=http://127.0.0.1:3100"
    echo "EVENT_HASH_SECRET=$(openssl rand -hex 32)"
  } >"${TEST_ENV_FILE}"
fi

chmod 600 "${TEST_ENV_FILE}"
append_env_if_missing "${TEST_ENV_FILE}" "NEXT_PUBLIC_APP_URL" "http://127.0.0.1:3100"
append_env_if_missing "${TEST_ENV_FILE}" "NEXT_PUBLIC_APP_ENV" "Test"
append_env_if_missing "${TEST_ENV_FILE}" "NEXT_PUBLIC_DATABASE_LABEL" "${TEST_DATABASE_NAME}"
append_env_if_missing "${TEST_ENV_FILE}" "PUBLIC_LINK_BASE_URL" "http://127.0.0.1:3100"
append_env_if_missing "${TEST_ENV_FILE}" "EVENT_HASH_SECRET" "$(openssl rand -hex 32)"
ensure_secret_length "${TEST_ENV_FILE}" "PAYLOAD_SECRET"
ensure_secret_length "${TEST_ENV_FILE}" "EVENT_HASH_SECRET"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${PROJECT_ROOT}"
npm install
npm run seed

echo "LinksetGo local setup is ready. Start it with: npm run dev"
echo "Local admin credentials are stored in ${ENV_FILE}."
