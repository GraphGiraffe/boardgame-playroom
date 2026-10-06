#!/usr/bin/env bash
# Sourced by the app's Cloud entry points. No profile or global config changes.
playroom_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
fail() { printf 'Error: %s\n' "$*" >&2; exit 2; }
require_runtime() {
  local command_name
  for command_name in node npm python3; do command -v "$command_name" >/dev/null || fail "Missing $command_name; install Node.js 22+ and Python 3.9+ first."; done
  node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Node.js 22+ required");process.exit(1)}' || fail 'Use the Node version from .nvmrc.'
  python3 -c 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"' || fail 'Python 3.9+ required.'
}
find_packs() {
  local candidate="${1:-}"
  if [[ -n "$candidate" ]]; then
    [[ -d "$candidate" ]] || fail "Pack directory does not exist: $candidate"
  elif [[ -d "$playroom_root/packs" ]]; then candidate="$playroom_root/packs"
  elif [[ -d "$playroom_root/../playroom-paks/packs" ]]; then candidate="$playroom_root/../playroom-paks/packs"
  elif [[ -d "$playroom_root/../boardgame-playroom-paks/packs" ]]; then candidate="$playroom_root/../boardgame-playroom-paks/packs"
  else return 1
  fi
  (cd -- "$candidate" && pwd -P)
}
require_five_source_packs() {
  python3 - "$1" <<'PY'
import json
from pathlib import Path
import sys
root = Path(sys.argv[1])
for game in ('uno', 'domino', 'durak', 'checkers', 'snakes'):
    for filename in ('manifest.json', 'manifest.js', 'rules.js', 'view.js', 'styles.css'):
        if not (root / game / filename).is_file():
            sys.exit(f'Full checks require all five source packs; missing {root / game / filename}. Use --packs-dir /path/to/playroom-paks/packs.')
    try:
        manifest = json.loads((root / game / 'manifest.json').read_text(encoding='utf-8'))
        if manifest.get('id') != game:
            raise ValueError('id does not match source directory')
    except (ValueError, OSError) as error:
        sys.exit(f'Invalid manifest for {game}: {error}')
print(f'Using all five source packs: {root}')
PY
}
