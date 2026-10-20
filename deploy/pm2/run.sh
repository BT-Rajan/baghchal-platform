#!/usr/bin/env bash
# What pm2 runs as "bhagchal2": the API server and the web front door together. If either
# stops, both stop and pm2 starts them again; "pm2 stop bhagchal2" stops both.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
# shellcheck source=/dev/null
source "$ROOT/bhagchal2.env"
# The email provider's settings (written by runonce.sh); they take the place of any older ones.
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/.env"
fi

# The password may hold characters that mean something in a URL (such as #), so encode it.
password=$(DB_PASSWORD="$DB_PASSWORD" "$ROOT/.venv/bin/python" -c \
  'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')
export BAGHCHAL_DATABASE_URL="mysql+asyncmy://${DB_USER}:${password}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
export BAGHCHAL_PUBLIC_BASE_URL="$PUBLIC_URL"
export BAGHCHAL_ALLOWED_ORIGINS="[\"$PUBLIC_URL\", \"http://localhost:$WEB_PORT\"]"
export BAGHCHAL_COMPUTER_WORKERS="${COMPUTER_WORKERS:-2}"
if [[ -n "${SMTP_HOST:-}" ]]; then
  export BAGHCHAL_MAIL_BACKEND=smtp BAGHCHAL_SMTP_HOST="$SMTP_HOST"
  export BAGHCHAL_SMTP_PORT="${SMTP_PORT:-587}" BAGHCHAL_SMTP_USERNAME="${SMTP_USERNAME:-}"
  export BAGHCHAL_SMTP_PASSWORD="${SMTP_PASSWORD:-}" BAGHCHAL_MAIL_FROM="${MAIL_FROM:-Bagh Chal <no-reply@localhost>}"
fi
# The key that encrypts the Razorpay keys an admin enters: made once, never committed.
SECRETS_FILE="$ROOT/.secrets_key"
if [[ ! -s "$SECRETS_FILE" ]]; then
  (umask 077 && head -c 32 /dev/urandom | base64 | tr -d '\n=' >"$SECRETS_FILE")
fi
BAGHCHAL_SECRETS_KEY="$(cat "$SECRETS_FILE")"
export BAGHCHAL_SECRETS_KEY
export WEB_PORT API_PORT PYTHONUNBUFFERED=1

"$ROOT/.venv/bin/uvicorn" baghchal_server.asgi:app --host 127.0.0.1 --port "$API_PORT" \
  --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header --ws-max-size 16384 &
api=$!
node "$ROOT/deploy/pm2/web.mjs" &
web=$!

stop() {
  kill -TERM "$api" "$web" 2>/dev/null || true
  wait "$api" "$web" 2>/dev/null || true
}
trap 'stop; exit 0' INT TERM
# Whichever ends first takes the other with it.
set +e
wait -n "$api" "$web"
status=$?
stop
exit "$status"
