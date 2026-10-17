#!/usr/bin/env bash
# Restore a dump made by backup.sh. This REPLACES the contents of the database.
#
#   restore.sh FILE.sql.gz --yes
#
# Stop the API servers first (players must not write while it runs), then run the migrations
# again afterwards in case the dump is from an older version. See docs/operations.md.
set -euo pipefail

file="${1:-}"
if [[ -z "$file" || "${2:-}" != "--yes" ]]; then
  echo "usage: restore.sh FILE.sql.gz --yes   (replaces the database ${DB_NAME:-baghchal})" >&2
  exit 2
fi
: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}"
gzip -t "$file"

export MYSQL_PWD="$DB_PASSWORD"
echo "restore: loading $file into ${DB_NAME} on ${DB_HOST}"
gunzip -c "$file" | mariadb --host="$DB_HOST" --user="$DB_USER" \
  --default-character-set=utf8mb4 "$DB_NAME"
echo "restore: done"
