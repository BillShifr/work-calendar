#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?Pass an explicit backup file}"
test -f "$1"
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" "$1"
