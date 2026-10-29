#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/tfoms-time-$stamp.dump"
pg_dump --format=custom --no-owner --no-acl --file="$target" "$DATABASE_URL"
pg_restore --list "$target" >/dev/null
printf '%s\n' "$target"
