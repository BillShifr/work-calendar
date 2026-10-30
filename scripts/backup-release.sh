#!/bin/sh
set -eu
umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/container-engine.sh"
. "$script_dir/lib/serialized-operation.sh"

backup_root=${1:?Usage: backup-release.sh BACKUP_ROOT}
lock_file=${BACKUP_RESTORE_LOCK_FILE:-/tmp/hr-backup-restore.lock}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$backup_root/$timestamp
staging_dir=$backup_dir.partial.$$

run_serialized_operation \
  "$lock_file" \
  "$script_dir/backup-release.sh" \
  "$script_dir/backup-release.sh" "$@"

mkdir -p "$backup_root"
test ! -e "$backup_dir"
mkdir "$staging_dir"
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -d "$staging_dir" ]; then
    case "$staging_dir" in
      "$backup_root"/*.partial.*) rm -rf -- "$staging_dir" ;;
      *) echo >&2 "Refusing to remove unexpected staging path: $staging_dir"; status=1 ;;
    esac
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

compose --profile ops run --rm --no-deps -T db-tools pg_dump -Fc \
  > "$staging_dir/database.dump"
compose --profile ops run --rm --no-deps -T db-tools pg_restore --list \
  < "$staging_dir/database.dump" >/dev/null
db_version=$(compose --profile ops run --rm --no-deps -T db-tools \
  psql -Atqc 'SHOW server_version')
revision=${VCS_REF:-unknown}
{
  printf 'BACKUP_FORMAT_VERSION=1\n'
  printf 'CREATED_AT=%s\n' "$timestamp"
  printf 'VCS_REF=%s\n' "$revision"
  printf 'DB_SERVER_VERSION=%s\n' "$db_version"
} > "$staging_dir/MANIFEST"
(cd "$staging_dir" && sha256sum MANIFEST database.dump > SHA256SUMS)
mv "$staging_dir" "$backup_dir"
trap - EXIT HUP INT TERM
printf 'Backup created: %s\n' "$backup_dir"
