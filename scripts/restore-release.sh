#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/container-engine.sh"
. "$script_dir/lib/serialized-operation.sh"

backup_dir=${1:?Usage: RESTORE_CONFIRM=replace-current-state restore-release.sh BACKUP_DIR}
lock_file=${BACKUP_RESTORE_LOCK_FILE:-/tmp/hr-backup-restore.lock}
if [ "${RESTORE_CONFIRM:-}" != "replace-current-state" ]; then
  echo >&2 "Set RESTORE_CONFIRM=replace-current-state to allow destructive restore"
  exit 1
fi

run_serialized_operation \
  "$lock_file" \
  "$script_dir/restore-release.sh" \
  "$script_dir/restore-release.sh" "$@"

for artifact in MANIFEST SHA256SUMS database.dump; do
  test -f "$backup_dir/$artifact" || {
    echo >&2 "Missing backup artifact: $artifact"
    exit 1
  }
done
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
compose --profile ops run --rm --no-deps -T db-tools pg_restore --list \
  < "$backup_dir/database.dump" >/dev/null

compose stop app
compose --profile ops run --rm --no-deps -T db-tools \
  dropdb --if-exists --force "${POSTGRES_DB:-hr}"
compose --profile ops run --rm --no-deps -T db-tools \
  createdb -O "${POSTGRES_USER:-hr}" "${POSTGRES_DB:-hr}"
compose --profile ops run --rm --no-deps -T db-tools pg_restore \
  --exit-on-error --no-owner --no-acl --dbname "${POSTGRES_DB:-hr}" \
  < "$backup_dir/database.dump"
DEPLOY_PULL=false sh "$script_dir/deploy-release.sh"
printf 'Restore completed from: %s\n' "$backup_dir"
