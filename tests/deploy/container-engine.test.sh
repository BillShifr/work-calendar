#!/bin/sh
set -eu

fixture=$(mktemp -d)
cleanup() { rm -rf -- "$fixture"; }
trap cleanup EXIT HUP INT TERM

mkdir -p "$fixture/bin" "$fixture/state"

cat > "$fixture/bin/podman" <<'SH'
#!/bin/sh
set -eu
printf 'podman %s\n' "$*" >> "$TEST_STATE/calls"
case "$*" in
  "compose version") ;;
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=running --format {{.ID}}")
    printf 'running-id\n'
    ;;
  "inspect --format {{.State.Status}} running-id") printf 'running\n' ;;
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=stopped --format {{.ID}}")
    printf 'stopped-id\n'
    ;;
  "inspect --format {{.State.Status}} stopped-id")
    if [ -f "$TEST_STATE/started" ]; then printf 'running\n'; else printf 'stopped\n'; fi
    ;;
  "start stopped-id") touch "$TEST_STATE/started" ;;
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=missing --format {{.ID}}") ;;
  "compose up -d missing") touch "$TEST_STATE/created" ;;
  "ps --all --filter label=com.docker.compose.project=hr --filter label=com.docker.compose.service=duplicate --format {{.ID}}")
    printf 'first-id\nsecond-id\n'
    ;;
  *) echo "unexpected podman call: $*" >&2; exit 1 ;;
esac
SH
chmod +x "$fixture/bin/podman"

PATH="$fixture/bin:$PATH"
TEST_STATE="$fixture/state"
CONTAINER_ENGINE=podman
export PATH TEST_STATE CONTAINER_ENGINE
. scripts/lib/container-engine.sh

ensure_compose_service_running hr running
ensure_compose_service_running hr stopped
test -f "$fixture/state/started"
ensure_compose_service_running hr missing
test -f "$fixture/state/created"
if ensure_compose_service_running hr duplicate; then
  echo "duplicate Compose services must fail closed" >&2
  exit 1
fi
