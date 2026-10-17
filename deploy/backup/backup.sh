#!/usr/bin/env bash
# One consistent, compressed dump of the database into $BACKUP_DIR, then delete dumps older
# than $BACKUP_KEEP_DAYS days. Safe while the game is running: InnoDB's consistent snapshot
# (--single-transaction) takes no locks that block players.
#
# Settings: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, BACKUP_DIR, BACKUP_KEEP_DAYS.
set -euo pipefail

: "${DB_HOST:?}" "${DB_NAME:?}" "${DB_USER:?}" "${DB_PASSWORD:?}" "${BACKUP_DIR:?}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR}/${DB_NAME}-${stamp}.sql.gz"

mkdir -p "$BACKUP_DIR"
# The password goes through the environment, not the command line, so `ps` cannot show it.
export MYSQL_PWD="$DB_PASSWORD"
mariadb-dump --host="$DB_HOST" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "${target}.partial"
# Only complete dumps get the final name, so a crash never leaves a truncated "backup".
gzip -t "${target}.partial"
mv "${target}.partial" "$target"
echo "backup: wrote $target ($(du -h "$target" | cut -f1))"

find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +"$keep_days" -print -delete \
  | sed 's/^/backup: removed /'
find "$BACKUP_DIR" -name '*.partial' -mmin +60 -delete
