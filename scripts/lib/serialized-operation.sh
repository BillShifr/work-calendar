#!/bin/sh

run_serialized_operation() {
  lock_file=$1
  token=$2
  shift 2

  if [ "${TFOMS_SERIALIZED_OPERATION_TOKEN:-}" = "$token" ]; then
    return 0
  fi

  command -v flock >/dev/null 2>&1 || {
    echo >&2 "flock is required for backup and restore operations"
    exit 1
  }

  status=0
  TFOMS_SERIALIZED_OPERATION_TOKEN=$token \
    flock --close --nonblock --conflict-exit-code 200 "$lock_file" "$@" || status=$?
  if [ "$status" -eq 200 ]; then
    echo >&2 "Another backup or restore operation is already running"
    exit 1
  fi
  exit "$status"
}
