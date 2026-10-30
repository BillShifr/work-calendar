#!/bin/sh
set -eu

fixture=$(mktemp -d)
cleanup() { rm -rf -- "$fixture"; }
trap cleanup EXIT HUP INT TERM

old_revision=1111111111111111111111111111111111111111
new_revision=2222222222222222222222222222222222222222
mkdir -p "$fixture/project/.git" "$fixture/project/scripts/lib" "$fixture/bin" "$fixture/home"
cp scripts/update-production.sh "$fixture/project/scripts/"
cp scripts/lib/container-engine.sh "$fixture/project/scripts/lib/"

cat > "$fixture/bin/git" <<'SH'
#!/bin/sh
set -eu
case "$*" in
  "status --porcelain") ;;
  "symbolic-ref --quiet --short HEAD") printf 'main\n' ;;
  "remote get-url origin") printf 'https://github.com/BillShifr/work-calendar.git\n' ;;
  "fetch --no-tags origin main") ;;
  "rev-parse HEAD")
    if [ -f "$TEST_STATE/merged" ]; then printf '%s\n' "$TEST_NEW"; else printf '%s\n' "$TEST_OLD"; fi
    ;;
  "rev-parse origin/main") printf '%s\n' "$TEST_NEW" ;;
  "merge-base --is-ancestor $TEST_OLD $TEST_NEW") ;;
  "merge --ff-only origin/main") touch "$TEST_STATE/merged" ;;
  *) echo "unexpected git call: $*" >&2; exit 1 ;;
esac
SH

cat > "$fixture/bin/curl" <<'SH'
#!/bin/sh
printf '{"workflow_runs":[{"head_sha":"%s","event":"push","name":"CI","run_number":7,"run_attempt":1,"status":"completed","conclusion":"success"}]}' "$TEST_NEW"
SH

cat > "$fixture/bin/podman" <<'SH'
#!/bin/sh
set -eu
printf 'podman %s\n' "$*" >> "$TEST_STATE/calls"
case "$*" in
  *"to_regclass('public.schema_migrations')"*) printf 't\n' ;;
esac
SH

for script_name in verify-release-image.sh backup-release.sh deploy-release.sh; do
  cat > "$fixture/project/scripts/$script_name" <<'SH'
#!/bin/sh
set -eu
printf '%s VCS_REF=%s %s\n' "$(basename "$0")" "${VCS_REF:-}" "$*" >> "$TEST_STATE/calls"
SH
done

chmod +x "$fixture/bin/git" "$fixture/bin/curl" "$fixture/bin/podman"
printf 'VCS_REF=%s\n' "$old_revision" > "$fixture/project/.env"

PATH="$fixture/bin:$PATH" \
HOME="$fixture/home" \
TEST_STATE="$fixture" \
TEST_OLD="$old_revision" \
TEST_NEW="$new_revision" \
CONTAINER_ENGINE=podman \
  sh "$fixture/project/scripts/update-production.sh"

test -f "$fixture/merged"
grep -F "podman compose build migrate app" "$fixture/calls" >/dev/null
grep -F "verify-release-image.sh VCS_REF=$new_revision $new_revision" "$fixture/calls" >/dev/null
grep -F "backup-release.sh VCS_REF=$old_revision $fixture/home/backups/hr-auto" "$fixture/calls" >/dev/null
grep -F "deploy-release.sh VCS_REF=$new_revision" "$fixture/calls" >/dev/null

if grep -q 'DOCKERHUB' .github/workflows/ci.yml; then
  echo "CI must not depend on Docker Hub credentials" >&2
  exit 1
fi
