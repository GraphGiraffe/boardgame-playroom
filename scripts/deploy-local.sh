#!/usr/bin/env bash
set -euo pipefail
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PLAYROOM_APP_ROOT="$app_root"
utils_root="${PLAYROOM_UTILS_ROOT:-$app_root/../boardgame-playroom-utils}"
exec bash "$utils_root/tools/app/deploy-local.sh" "$@"
