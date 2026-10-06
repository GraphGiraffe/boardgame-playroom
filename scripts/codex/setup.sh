#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
usage() { printf '%s\n' 'Usage: bash scripts/codex/setup.sh [--packs-dir PATH] [--install-system-deps]' 'Installs locked npm dependencies, finds or downloads Chromium, and prepares local index.html.'; }
packs_dir='' install_system_deps=false
while (($#)); do
  case "$1" in
    --packs-dir) (($# >= 2)) && [[ -n "$2" && "$2" != --* ]] || fail '--packs-dir requires a path'; packs_dir="$2"; shift 2 ;;
    --install-system-deps) install_system_deps=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "Unknown argument: $1" ;;
  esac
done
require_runtime
resolved_packs=''
if [[ -n "$packs_dir" ]]; then resolved_packs="$(find_packs "$packs_dir")"
elif resolved_packs="$(find_packs)"; then :
else resolved_packs=''
fi
cd -- "$playroom_root"
npm ci --no-audit --no-fund
if $install_system_deps; then node node_modules/playwright-core/cli.js install-deps chromium; fi
if browser="$(node scripts/codex/browser.cjs)"; then
  printf 'Using browser: %s\n' "$browser"
else
  browser_status=$?
  [[ "$browser_status" == 3 ]] || fail 'Browser override or dependency is invalid; correct it before retrying.'
  node node_modules/playwright-core/cli.js install chromium
fi
node scripts/codex/browser.cjs --check || fail 'Browser could not start. If system libraries are missing, rerun setup with --install-system-deps.'
if [[ -n "$resolved_packs" ]]; then python3 build.py --prepare-dev --packs-dir "$resolved_packs"
else python3 build.py --prepare-dev
fi
printf '%s\n' 'Setup complete. Run bash scripts/codex/check.sh, or add --full to check all five games.'
