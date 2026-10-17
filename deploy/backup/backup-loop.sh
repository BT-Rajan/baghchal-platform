#!/usr/bin/env bash
# Run backup.sh once a day at $BACKUP_AT (HH:MM, UTC). A failed backup is retried in an hour,
# and the container keeps running either way so the next night is not missed.
set -uo pipefail

at="${BACKUP_AT:-03:15}"
here="$(dirname "$0")"

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today ${at}" +%s)
  (( next <= now )) && next=$(date -u -d "tomorrow ${at}" +%s)
  echo "backup: next run at $(date -u -d "@${next}" '+%Y-%m-%d %H:%M') UTC"
  sleep $(( next - now ))
  until bash "${here}/backup.sh"; do
    echo "backup: FAILED; retrying in an hour" >&2
    sleep 3600
  done
done
