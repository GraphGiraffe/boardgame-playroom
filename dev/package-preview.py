#!/usr/bin/env python3
"""Build an offline client and a dependency-free Node LAN test kit from explicit packs."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("playroom_build", ROOT / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packs-dir", required=True, type=Path)
    args = parser.parse_args()
    packs, _ = build.read_packs(args.packs_dir.resolve())
    uno = next((p for p in packs if p['manifest']['id'] == 'uno'), None)
    if not uno or not {'table', 'player'} <= set(uno['manifest'].get('capabilities', {}).get('surfaces', [])):
        raise ValueError('Нужен UNO с поддержкой table/player')
    output = ROOT / 'dist' / 'preview'
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    kit = output / 'playroom-preview'
    kit.mkdir()
    # Include only maintained source. Never distribute .git, credentials or saved parties.
    for source in build.source_files():
        if source.suffix not in {'.js', '.cjs', '.css', '.html'} or 'tests' in source.parts:
            continue
        target = kit / source.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    (kit / 'preview-packs').mkdir()
    for pack in packs:
        (kit / 'preview-packs' / (pack['manifest']['id'] + '.playroom-pack.json')).write_text(build.json_text(pack), encoding='utf-8')
    (kit / 'installed-packs.js').write_text(build.installed_script(packs), encoding='utf-8')
    # Normal local gameplay remains a standalone HTML, independent of the LAN server.
    html = build.bundle_html(packs)
    (output / 'playroom-all-games.html').write_text(html, encoding='utf-8')
    (kit / 'playroom-all-games.html').write_text(html, encoding='utf-8')
    (kit / 'START-WINDOWS.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\nnode dev\\serve-preview.cjs --lan\r\npause\r\n')
    (kit / 'START-MAC-LINUX.sh').write_text('#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nexec node dev/serve-preview.cjs --lan\n', encoding='utf-8')
    (kit / 'START-MAC-LINUX.sh').chmod(0o755)
    instructions = (ROOT / 'docs' / 'PREVIEW-TESTING.md').read_text(encoding='utf-8')
    (kit / 'READ-ME-RU.md').write_text(instructions, encoding='utf-8')
    provenance = {'kind': 'development-preview', 'appVersion': json.loads((ROOT/'package.json').read_text())['version'], 'packs': {p['manifest']['id']: p['manifest']['version'] for p in packs}}
    try:
        provenance['appWorktreeBase'] = subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip()
        provenance['workingTreeModified'] = bool(subprocess.check_output(['git','status','--porcelain'], cwd=ROOT, text=True).strip())
    except (OSError, subprocess.CalledProcessError):
        pass
    (kit / 'BUILD-INFO.json').write_text(json.dumps(provenance, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    files = sorted(p for p in kit.rglob('*') if p.is_file())
    (kit / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(kit).as_posix()}\n' for p in files), encoding='utf-8')
    build.write_zip(output/'playroom-phone-pc-preview.zip', [(p.relative_to(output).as_posix(),p.read_bytes()) for p in kit.rglob('*') if p.is_file()])
    print(output/'playroom-phone-pc-preview.zip')
    print(output/'playroom-all-games.html')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
