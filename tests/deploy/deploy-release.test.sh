#!/bin/sh
set -eu

fixture=$(mktemp -d)
cleanup() { rm -rf -- "$fixture"; }
trap cleanup EXIT HUP INT TERM

revision=3333333333333333333333333333333333333333
mkdir -p "$fixture/project/scripts/lib" "$fixture/bin"
cp scripts/deploy-release.sh "$fixture/project/scripts/"
cp scripts/lib/container-engine.sh "$fixture/project/scripts/lib/"

cat > "$fixture/bin/podman" <<'SH'
#!/bin/sh
set -eu
printf 'podman %s\n' "$*" >> "$TEST_STATE/calls"
case "$*" in
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=db --format {{.ID}}")
    printf 'existing-db-id\n'
    ;;
  "inspect --format {{.State.Status}} existing-db-id") printf 'running\n' ;;
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=app --format {{.ID}}")
    printf 'existing-app-id\n'
    ;;
  "compose up -d db")
    echo 'existing database container would be recreated' >&2
    exit 125
    ;;
esac
SH

cat > "$fixture/bin/curl" <<'SH'
#!/bin/sh
exit 0
SH

cat > "$fixture/project/scripts/verify-release-image.sh" <<'SH'
#!/bin/sh
set -eu
printf 'verify-release-image.sh %s\n' "$*" >> "$TEST_STATE/calls"
SH

chmod +x "$fixture/bin/podman" "$fixture/bin/curl"
printf 'VCS_REF=%s\n' 1111111111111111111111111111111111111111 > "$fixture/project/.env"

PATH="$fixture/bin:$PATH" \
TEST_STATE="$fixture" \
CONTAINER_ENGINE=podman \
VCS_REF="$revision" \
DEPLOY_PULL=false \
  sh "$fixture/project/scripts/deploy-release.sh"

grep -F "podman inspect --format {{.State.Status}} existing-db-id" "$fixture/calls" >/dev/null
if grep -F "podman compose up -d db" "$fixture/calls" >/dev/null; then
  echo "existing database service must not be recreated" >&2
  exit 1
fi
grep -F "podman compose --profile ops run --rm --no-deps -T migrate npm run db:migrate" "$fixture/calls" >/dev/null
grep -F "podman compose --profile ops run --rm --no-deps -T migrate npm run db:seed:reference" "$fixture/calls" >/dev/null
grep -F "podman compose --profile ops run --rm --no-deps -T migrate npm run db:bootstrap-admin" "$fixture/calls" >/dev/null
grep -F "podman stop existing-app-id" "$fixture/calls" >/dev/null
grep -F "podman rm existing-app-id" "$fixture/calls" >/dev/null
grep -F "podman compose up -d --no-deps --no-build app" "$fixture/calls" >/dev/null
grep -F "VCS_REF=$revision" "$fixture/project/.env" >/dev/null
