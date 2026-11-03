#!/bin/sh
set -eu

fixture=$(mktemp -d)
cleanup() { rm -rf -- "$fixture"; }
trap cleanup EXIT HUP INT TERM

mkdir -p "$fixture/bin" "$fixture/scripts/lib"
cp scripts/lib/serialized-operation.sh "$fixture/scripts/lib/"

cat > "$fixture/bin/flock" <<'SH'
#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  case "$1" in
    --close | --nonblock) shift ;;
    --conflict-exit-code) shift 2 ;;
    *) shift; break ;;
  esac
done
"$@"
SH
chmod +x "$fixture/bin/flock"

cat > "$fixture/scripts/non-executable-operation.sh" <<'SH'
#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/serialized-operation.sh"

run_serialized_operation \
  "$script_dir/operation.lock" \
  "$script_dir/non-executable-operation.sh" \
  "$script_dir/non-executable-operation.sh" "$@"

printf 'completed\n' > "$1"
SH
chmod 644 "$fixture/scripts/non-executable-operation.sh"
test ! -x "$fixture/scripts/non-executable-operation.sh"

PATH="$fixture/bin:$PATH" \
  sh "$fixture/scripts/non-executable-operation.sh" "$fixture/result"

test "$(cat "$fixture/result")" = completed
