#!/bin/sh

if [ -z "${CONTAINER_ENGINE:-}" ]; then
  if command -v podman >/dev/null 2>&1; then
    CONTAINER_ENGINE=podman
  elif command -v docker >/dev/null 2>&1; then
    CONTAINER_ENGINE=docker
  else
    echo >&2 "Neither podman nor docker is available"
    exit 1
  fi
fi

case "$CONTAINER_ENGINE" in
  podman|docker) ;;
  *) echo >&2 "CONTAINER_ENGINE must be podman or docker"; exit 1 ;;
esac

command -v "$CONTAINER_ENGINE" >/dev/null 2>&1 || {
  echo >&2 "$CONTAINER_ENGINE is not available"
  exit 1
}

container_engine() {
  "$CONTAINER_ENGINE" "$@"
}

compose() {
  "$CONTAINER_ENGINE" compose "$@"
}

compose_service_container_ids() {
  csc_project=$1
  csc_service=$2
  container_engine ps --all \
    --filter "label=com.docker.compose.project=$csc_project" \
    --filter "label=com.docker.compose.service=$csc_service" \
    --format '{{.ID}}'
}

ensure_compose_service_running() {
  ecs_project=$1
  ecs_service=$2
  ecs_ids=$(compose_service_container_ids "$ecs_project" "$ecs_service")
  set -- $ecs_ids

  case $# in
    0)
      compose up -d "$ecs_service"
      return
      ;;
    1) ecs_container_id=$1 ;;
    *)
      echo >&2 "Multiple containers found for Compose service $ecs_project/$ecs_service"
      return 1
      ;;
  esac

  ecs_status=$(container_engine inspect --format '{{.State.Status}}' "$ecs_container_id")
  case "$ecs_status" in
    running)
      printf 'Reusing running Compose service %s/%s (%s)\n' \
        "$ecs_project" "$ecs_service" "$ecs_container_id"
      ;;
    configured|created|exited|stopped)
      container_engine start "$ecs_container_id" >/dev/null
      ecs_status=$(container_engine inspect --format '{{.State.Status}}' "$ecs_container_id")
      [ "$ecs_status" = running ] || {
        echo >&2 "Compose service $ecs_project/$ecs_service did not reach running state"
        return 1
      }
      ;;
    *)
      echo >&2 "Compose service $ecs_project/$ecs_service is in unsupported state: $ecs_status"
      return 1
      ;;
  esac
}

replace_compose_service() {
  rcs_project=$1
  rcs_service=$2
  rcs_up_option=${3:-}
  case "$rcs_up_option" in
    ""|--no-build) ;;
    *)
      echo >&2 "Unsupported Compose replacement option: $rcs_up_option"
      return 1
      ;;
  esac
  rcs_ids=$(compose_service_container_ids "$rcs_project" "$rcs_service")
  set -- $rcs_ids

  case $# in
    0) ;;
    1)
      rcs_container_id=$1
      container_engine stop "$rcs_container_id" >/dev/null
      container_engine rm "$rcs_container_id" >/dev/null
      ;;
    *)
      echo >&2 "Multiple containers found for Compose service $rcs_project/$rcs_service"
      return 1
      ;;
  esac

  if [ -n "$rcs_up_option" ]; then
    compose up -d --no-deps "$rcs_up_option" "$rcs_service"
  else
    compose up -d --no-deps "$rcs_service"
  fi
}

compose version >/dev/null
