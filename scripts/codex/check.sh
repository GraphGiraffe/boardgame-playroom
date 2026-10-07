#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
usage() { printf '%s\n' 'Usage: bash scripts/codex/check.sh [--full [--packs-dir PATH]]' 'Default: independent app/core build and tests. --full: all five source packs and every test.'; }
full=false packs_dir=''
while (($#)); do
  case "$1" in
    --full) full=true; shift ;;
    --packs-dir) (($# >= 2)) && [[ -n "$2" && "$2" != --* ]] || fail '--packs-dir requires a path'; packs_dir="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "Unknown argument: $1" ;;
  esac
done
$full || [[ -z "$packs_dir" ]] || fail '--packs-dir is only meaningful together with --full.'
require_runtime
resolved_packs=''
if $full; then
  resolved_packs="$(find_packs "$packs_dir")" || fail 'Full checks require all five source packs. Pass --packs-dir /path/to/playroom-paks/packs.'
  require_five_source_packs "$resolved_packs"
fi
cd -- "$playroom_root"
node scripts/codex/browser.cjs >/dev/null
for script in app/*.js app/transports/*.js core/*.js dev/*.js dev/*.cjs scripts/codex/*.cjs tests/*.cjs; do node --check "$script"; done
for script in build.sh scripts/codex/*.sh; do bash -n "$script"; done
python3 -c 'import ast; from pathlib import Path; [ast.parse(p.read_text(encoding="utf-8")) for p in [Path("build.py"), *Path("dev").glob("*.py")]]'
if $full; then
  python3 build.py --prepare-dev --all-games --packs-dir "$resolved_packs"
  npm test
else
  # App-only checks must not erase a developer's prepared game collection.
  if [[ ! -f installed-packs.js ]]; then python3 build.py --prepare-dev; fi
  python3 build.py
  npm run test:app
fi
