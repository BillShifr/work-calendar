#!/bin/sh
set -eu
umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
. "$script_dir/lib/container-engine.sh"

fail() {
  echo "update-production: $*" >&2
  exit 1
}

for command_name in curl git python3; do
  command -v "$command_name" >/dev/null 2>&1 || fail "required command is missing: $command_name"
done

cd "$project_root"
[ -d .git ] || fail "project directory is not a Git checkout"
[ -z "$(git status --porcelain)" ] || fail "working tree is not clean"

deploy_branch=${DEPLOY_BRANCH:-main}
remote_name=${DEPLOY_REMOTE:-origin}
repository=${GITHUB_REPOSITORY:-BillShifr/work-calendar}
workflow_name=${CI_WORKFLOW_NAME:-CI}
backup_root=${BACKUP_ROOT:-"$HOME/backups/tfoms-time-auto"}

current_branch=$(git symbolic-ref --quiet --short HEAD || true)
[ "$current_branch" = "$deploy_branch" ] || \
  fail "expected branch $deploy_branch, got ${current_branch:-detached HEAD}"

remote_url=$(git remote get-url "$remote_name")
case "$remote_url" in
  https://github.com/BillShifr/work-calendar.git | git@github.com:BillShifr/work-calendar.git) ;;
  *) fail "unexpected deployment remote: $remote_url" ;;
esac

git fetch --no-tags "$remote_name" "$deploy_branch"
current_revision=$(git rev-parse HEAD)
target_revision=$(git rev-parse "$remote_name/$deploy_branch")
case "$target_revision" in *[!0-9a-f]*|'') fail "target revision is not a hexadecimal SHA" ;; esac
[ "${#target_revision}" -eq 40 ] || fail "target revision must be a full Git SHA"
git merge-base --is-ancestor "$current_revision" "$target_revision" || \
  fail "$remote_name/$deploy_branch is not a fast-forward from the local checkout"

ci_response=$(mktemp)
cleanup() { rm -f "$ci_response"; }
trap cleanup EXIT HUP INT TERM
ci_url="https://api.github.com/repos/$repository/actions/runs?branch=$deploy_branch&event=push&head_sha=$target_revision&per_page=20"
curl --fail --silent --show-error --location \
  --connect-timeout 10 --max-time 30 \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "$ci_url" > "$ci_response" || fail "GitHub CI status is unavailable"

python3 - "$ci_response" "$target_revision" "$workflow_name" <<'PY' || \
  fail "successful GitHub Actions CI is required for the target revision"
import json
import sys

path, expected_sha, workflow_name = sys.argv[1:]
with open(path, encoding="utf-8") as source:
    payload = json.load(source)
runs = [
    run for run in payload.get("workflow_runs", [])
    if run.get("head_sha") == expected_sha
    and run.get("event") == "push"
    and run.get("name") == workflow_name
]
if not runs:
    raise SystemExit(1)
run = max(runs, key=lambda item: (item.get("run_number", 0), item.get("run_attempt", 0)))
if run.get("status") != "completed" or run.get("conclusion") != "success":
    raise SystemExit(1)
PY

git merge --ff-only "$remote_name/$deploy_branch"
[ -z "$(git status --porcelain)" ] || fail "working tree changed during update"
test "$(git rev-parse HEAD)" = "$target_revision" || fail "checkout did not reach target revision"

export VCS_REF=$target_revision
compose config >/dev/null
compose build migrate app
sh "$script_dir/verify-release-image.sh" "$target_revision"

# Start only PostgreSQL for an online backup. The existing application remains
# running on its previous image until all preflight checks and the backup pass.
compose up -d db
attempt=0
until compose --profile ops run --rm --no-deps -T db-tools pg_isready >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 20 ] || fail "database readiness timeout before backup"
  sleep 3
done

schema_exists=$(compose --profile ops run --rm --no-deps -T db-tools \
  psql -Atqc "SELECT to_regclass('public.schema_migrations') IS NOT NULL")
if [ "$schema_exists" = t ]; then
  deployed_revision=$(sed -n 's/^VCS_REF=//p' .env 2>/dev/null || true)
  case "$deployed_revision" in *[!0-9a-f]*|'') deployed_revision=$current_revision ;; esac
  VCS_REF=$deployed_revision CONTAINER_ENGINE=$CONTAINER_ENGINE \
    sh "$script_dir/backup-release.sh" "$backup_root"
else
  echo "update-production: empty database detected; initial backup is not required"
fi

DEPLOY_PULL=false CONTAINER_ENGINE=$CONTAINER_ENGINE \
  sh "$script_dir/deploy-release.sh"
printf 'Production updated to %s\n' "$target_revision"
