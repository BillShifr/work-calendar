#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
bundle_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
. "$script_dir/lib/container-engine.sh"

if [ -f "$bundle_dir/SHA256SUMS" ]; then
  (cd "$bundle_dir" && sha256sum -c SHA256SUMS)
fi
if [ -f "$bundle_dir/RELEASE" ]; then
  VCS_REF=$(sed -n 's/^VCS_REF=//p' "$bundle_dir/RELEASE")
  export VCS_REF
fi
expected_revision=${VCS_REF:?VCS_REF must be a full Git commit SHA}
case "$expected_revision" in *[!0-9a-f]*|'') exit 1 ;; esac
test "${#expected_revision}" -eq 40

pull_release=${DEPLOY_PULL:-true}
case "$pull_release" in true|false) ;; *) exit 1 ;; esac
compose config >/dev/null

if [ "$pull_release" = true ]; then
  container_engine pull "${APP_IMAGE_REPOSITORY:-docker.io/billshifr/tfoms-time}:$expected_revision"
  container_engine pull "${MIGRATOR_IMAGE_REPOSITORY:-docker.io/billshifr/tfoms-time-migrator}:$expected_revision"
  container_engine pull postgres:18.1-alpine
fi
sh "$script_dir/verify-release-image.sh" "$expected_revision"

compose up -d db
attempt=0
until compose --profile ops run --rm --no-deps -T db-tools pg_isready >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    compose logs --tail=200 db >&2 || true
    echo >&2 "Database readiness timeout"
    exit 1
  fi
  sleep 3
done

# Migrations and reference data run before replacing the current web process.
# Every production migration must therefore remain backward-compatible with
# the currently running application revision.
compose --profile ops run --rm --no-deps migrate npm run db:migrate
compose --profile ops run --rm --no-deps migrate npm run db:seed:reference
compose --profile ops run --rm --no-deps migrate npm run db:bootstrap-admin
compose up -d --no-build app

app_port=${APP_PORT:-3080}
attempt=0
until curl --max-time 3 --silent --fail \
  "http://127.0.0.1:$app_port/api/health" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 24 ]; then
    compose logs --tail=200 app >&2 || true
    echo >&2 "Application readiness timeout; automatic rollback is disabled after migrations"
    exit 1
  fi
  sleep 5
done

if [ -f "$bundle_dir/.env" ]; then
  if grep -q '^VCS_REF=' "$bundle_dir/.env"; then
    sed -i.bak "s/^VCS_REF=.*/VCS_REF=$expected_revision/" "$bundle_dir/.env"
    rm -f "$bundle_dir/.env.bak"
  else
    printf 'VCS_REF=%s\n' "$expected_revision" >> "$bundle_dir/.env"
  fi
  chmod 600 "$bundle_dir/.env"
fi
compose ps
printf 'Release deployed: %s\n' "$expected_revision"
