#!/usr/bin/env bash
# Run from the private manual-deploy kit or a checkout with a supplied bundle dir.
set -euo pipefail
app_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
bundle_dir="$(cd -- "${1:-$app_root}" && pwd)"
cd -- "$app_root"
command -v python3 >/dev/null
command -v node >/dev/null
command -v npx >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<22)throw Error("Node.js 22+ required")'
if ! node -e 'require("playwright-core")' >/dev/null 2>&1; then npm ci --no-audit --no-fund; fi
node scripts/codex/browser.cjs --check >/dev/null
release_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release"])' "$bundle_dir/release-info.json")"
protected_name="playroom-pages-${release_version#v}-protected.zip"
app_commit="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["appCommit"])' "$bundle_dir/release-info.json")"
fallback_args=()
if [[ -n "${PAGES_FALLBACK_DEPLOYMENT:-}" ]]; then fallback_args=(--deployment "$PAGES_FALLBACK_DEPLOYMENT"); fi
python3 scripts/pages-deploy.py deploy --release "$release_version" "${fallback_args[@]}" \
  --public "$bundle_dir/playroom-pwa.zip" --checksums "$bundle_dir/SHA256SUMS" \
  --protected-base "$bundle_dir/$protected_name" \
  --commit "$app_commit" --report "$bundle_dir/deploy-report.json"
