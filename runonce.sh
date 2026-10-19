#!/usr/bin/env bash
# Sets up ClawPlay (Bagh Chal) to run under pm2 as "bhagchal2": settings, the MariaDB database, the
# server's Python environment, database migrations and the web app build.
# Run it once, and again after every update (git pull); it is safe to repeat.
# Then: ./start.sh and ./stop.sh.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD
CONFIG="$ROOT/bhagchal2.env"

fail() { echo "runonce: $*" >&2; exit 1; }
step() { echo "==> $*"; }

# --- Tools -----------------------------------------------------------------------------------
for tool in node npm pm2 curl; do
  command -v "$tool" >/dev/null || fail "$tool is not installed"
done
(( $(node -p 'process.versions.node.split(".")[0]') >= 20 )) || fail "Node.js 20 or newer is needed"
DB_CLIENT=$(command -v mariadb || command -v mysql || true)
[[ -n "$DB_CLIENT" ]] || fail "the MariaDB client (mariadb or mysql) is not installed"
if ! command -v uv >/dev/null; then
  step "Installing uv (Python package manager) for this user"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# --- Settings (kept in bhagchal2.env, never committed) ---------------------------------------
if [[ ! -f "$CONFIG" ]]; then
  step "Writing settings to bhagchal2.env"
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    read -rsp "MariaDB password for app_user: " DB_PASSWORD
    echo
  fi
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  umask 077
  cat >"$CONFIG" <<EOF
# Settings for ./start.sh (pm2 app "bhagchal2"). Run ./runonce.sh again after changing them.
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=bhagchal2
DB_USER=app_user
DB_PASSWORD='${DB_PASSWORD//\'/\'\\\'\'}'

# Where players open the game, and the ports on this machine.
PUBLIC_URL=http://${ip:-localhost}:7070
WEB_PORT=7070
API_PORT=7071

# Processes thinking for the computer opponent (about one CPU core each).
COMPUTER_WORKERS=2

# Email (sign-up confirmations, password resets) is set in .env, beside this file.

# Payments (Razorpay Dashboard -> Account & Settings -> API Keys; and Webhooks, sending to
# PUBLIC_URL/api/v1/payments/webhook). Empty: "Paying online is coming soon".
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
EOF
fi
# shellcheck source=/dev/null
source "$CONFIG"

# --- Email provider (kept in .env, never committed) ------------------------------------------
MAIL_CONFIG="$ROOT/.env"
if [[ ! -f "$MAIL_CONFIG" ]]; then
  step "Writing the email settings to .env (fill them in to send real emails)"
  # A value in single quotes, safe to read back with "source".
  quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
  # Any email settings an older bhagchal2.env had are carried over.
  (umask 077 && cat >"$MAIL_CONFIG") <<EOF
# Email for ClawPlay: sign-up confirmations, password resets and parents' links.
# Fill in your email provider's SMTP details (one with SPF and DKIM set up for the sending
# domain, or the links land in spam), then restart: ./start.sh
# Without SMTP_HOST the emails, links included, are only written to: pm2 logs bhagchal2
SMTP_HOST=$(quote "${SMTP_HOST:-}")
# 587 (STARTTLS) or 465 (TLS from the start), as your provider says.
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USERNAME=$(quote "${SMTP_USERNAME:-}")
SMTP_PASSWORD=$(quote "${SMTP_PASSWORD:-}")
# The sender players see; its domain must be one your provider may send for.
MAIL_FROM=$(quote "${MAIL_FROM:-ClawPlay <no-reply@example.com>}")
EOF
fi

# --- Database --------------------------------------------------------------------------------
step "Creating database $DB_NAME (if it does not exist)"
if ! MYSQL_PWD="$DB_PASSWORD" "$DB_CLIENT" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e \
  "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"; then
  cat >&2 <<EOF
runonce: could not create the database as $DB_USER. Create it as the MariaDB root user:
  sudo mariadb -e "CREATE DATABASE IF NOT EXISTS \\\`$DB_NAME\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON \\\`$DB_NAME\\\`.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;"
then run ./runonce.sh again.
EOF
  exit 1
fi

# --- Server ----------------------------------------------------------------------------------
step "Installing the server"
uv sync --locked --no-dev --package baghchal-server --quiet

step "Updating the database tables"
password=$(DB_PASSWORD="$DB_PASSWORD" "$ROOT/.venv/bin/python" -c \
  'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')
(cd server && BAGHCHAL_DATABASE_URL="mysql+asyncmy://${DB_USER}:${password}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
  "$ROOT/.venv/bin/alembic" upgrade head)

# --- Web app ---------------------------------------------------------------------------------
step "Building the web app for $PUBLIC_URL"
cd "$ROOT/app"
npm ci --no-audit --no-fund --loglevel=error
# A release build accepts plain http only to this machine unless told otherwise: on a private
# network without https, passwords cross the network unencrypted.
allow_http=false
if [[ "$PUBLIC_URL" == http://* ]]; then allow_http=true; fi
EXPO_PUBLIC_API_URL="$PUBLIC_URL" EXPO_PUBLIC_ALLOW_PLAIN_HTTP="$allow_http" EXPO_NO_TELEMETRY=1 \
  npx expo export --platform web --output-dir dist >/dev/null
cd "$ROOT"

chmod +x start.sh stop.sh deploy/pm2/run.sh
echo
echo "Setup done. Start with ./start.sh, then open $PUBLIC_URL"
