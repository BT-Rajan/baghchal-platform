#!/usr/bin/env bash
# Starts Bagh Chal (API server and web app) under pm2 as "bhagchal2". Set up first: ./runonce.sh
set -uo pipefail
cd "$(dirname "$0")"
[[ -f bhagchal2.env && -d .venv && -f app/dist/index.html ]] || {
  echo "bhagchal2 is not set up yet: run ./runonce.sh first" >&2
  exit 1
}
# shellcheck source=/dev/null
source bhagchal2.env

if pm2 describe bhagchal2 >/dev/null 2>&1; then
  pm2 restart bhagchal2 --update-env >/dev/null 2>&1
else
  pm2 start deploy/pm2/run.sh --name bhagchal2 --interpreter bash --kill-timeout 10000 \
    >/dev/null 2>&1
fi

# Started means answering: the API ready (database reachable) and the web app serving.
for _ in $(seq 60); do
  if curl -fsS "http://127.0.0.1:$API_PORT/health/ready" >/dev/null 2>&1 &&
    curl -fsS "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
    echo "bhagchal2 started: $PUBLIC_URL"
    exit 0
  fi
  sleep 1
done
echo "bhagchal2 did not start; see: pm2 logs bhagchal2" >&2
exit 1
