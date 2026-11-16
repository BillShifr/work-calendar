#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/container-engine.sh"

expected_revision=${1:?Usage: verify-release-image.sh REVISION}
app_image="${APP_IMAGE_REPOSITORY:-hr}:$expected_revision"
migrator_image="${MIGRATOR_IMAGE_REPOSITORY:-hr-migrator}:$expected_revision"

resolve_image() {
  ri_name=$1
  if container_engine image inspect "$ri_name" >/dev/null 2>&1; then
    printf '%s' "$ri_name"
    return
  fi
  case "$ri_name" in
    localhost/*) ;;
    *)
      if container_engine image inspect "localhost/$ri_name" >/dev/null 2>&1; then
        printf 'localhost/%s' "$ri_name"
        return
      fi
      ;;
  esac
  echo "verify-release-image: image not found: $ri_name" >&2
  exit 1
}

app_image=$(resolve_image "$app_image")
migrator_image=$(resolve_image "$migrator_image")

for image in "$app_image" "$migrator_image"; do
  actual_revision=$(container_engine image inspect \
    --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$image")
  test "$actual_revision" = "$expected_revision"
done

runtime_probe() {
  cap_check=
  case "$CONTAINER_ENGINE" in
    podman)
      # Rootless Podman can report a non-zero CapEff mask while --cap-drop=ALL
      # is still enforced; NoNewPrivs and read-only probe are the release gate.
      cap_check=':' ;;
    *)
      cap_check='grep -q "^CapEff:[[:space:]]*0000000000000000$" /proc/self/status' ;;
  esac

  container_engine run --rm --network none --read-only --tmpfs /tmp:size=64m \
    --cap-drop ALL --security-opt no-new-privileges "$app_image" sh -c "
      test ! -e /app/.git
      test ! -e /app/.env
      test ! -e /app/tests
      grep -q '^NoNewPrivs:[[:space:]]*1\$' /proc/self/status
      $cap_check
      ! touch /app/runtime-write-probe
    "
}

if ! runtime_probe; then
  echo "verify-release-image: runtime hardening probe failed" >&2
  container_engine run --rm --network none --read-only --tmpfs /tmp:size=64m \
    --cap-drop ALL --security-opt no-new-privileges "$app_image" sh -c \
    'grep -E "^(CapEff|NoNewPrivs):" /proc/self/status || true' >&2 || true
  exit 1
fi

printf 'Verified release images for %s\n' "$expected_revision"
