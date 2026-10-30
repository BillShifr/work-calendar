#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/container-engine.sh"

expected_revision=${1:?Usage: verify-release-image.sh REVISION}
app_image="${APP_IMAGE_REPOSITORY:-hr}:$expected_revision"
migrator_image="${MIGRATOR_IMAGE_REPOSITORY:-hr-migrator}:$expected_revision"

for image in "$app_image" "$migrator_image"; do
  actual_revision=$(container_engine image inspect \
    --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$image")
  test "$actual_revision" = "$expected_revision"
done

container_engine run --rm --network none --read-only --tmpfs /tmp:size=64m \
  --cap-drop ALL --security-opt no-new-privileges "$app_image" sh -c '
    test ! -e /app/.git
    test ! -e /app/.env
    test ! -e /app/tests
    grep -q "^CapEff:[[:space:]]*0000000000000000$" /proc/self/status
    grep -q "^NoNewPrivs:[[:space:]]*1$" /proc/self/status
    ! touch /app/runtime-write-probe
  '
printf 'Verified release images for %s\n' "$expected_revision"
