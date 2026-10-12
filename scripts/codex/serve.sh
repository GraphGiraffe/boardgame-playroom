#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then printf '%s\n' 'Usage: bash scripts/codex/serve.sh [PORT] (default: 4173, bind: 127.0.0.1)'; exit 0; fi
(($# <= 1)) || fail 'Usage: bash scripts/codex/serve.sh [PORT]'
port="${1:-4173}"
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || fail 'PORT must be an integer from 1 to 65535.'
command -v python3 >/dev/null || fail 'Python 3.9+ required.'
if [[ ! -f "$playroom_root/installed-packs.js" ]]; then python3 "$playroom_root/build.py" --prepare-dev; fi
printf 'Playroom: http://127.0.0.1:%s/\n' "$((10#$port))"
exec python3 -m http.server "$((10#$port))" --bind 127.0.0.1 --directory "$playroom_root"
