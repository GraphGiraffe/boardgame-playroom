#!/usr/bin/env python3
"""Combine a public PWA ZIP with an existing private Pages access wrapper.

The output is private. Never add it, the input wrapper, or its extracted files
as public release assets. Passwords are neither read as configuration nor logged.
"""
import argparse
import re
from pathlib import PurePosixPath, Path
from zipfile import ZipFile, ZIP_DEFLATED


def package(public, protected_base, output):
    with ZipFile(public) as source, ZipFile(protected_base) as private:
        names = [n for n in source.namelist() if not n.endswith('/')]
        indexes = [n for n in names if n == 'index.html' or n.endswith('/index.html')]
        if len(indexes) != 1:
            raise ValueError('Expected one PWA index.html')
        prefix = indexes[0][:-len('index.html')]
        if any(not n.startswith(prefix) for n in names):
            raise ValueError('Files outside the PWA root')
        files = {}
        for name in names:
            relative = name[len(prefix):]
            if not relative or relative.startswith('/') or '..' in PurePosixPath(relative).parts or '\\' in relative or relative in files:
                raise ValueError('Unsafe or duplicate archive path')
            files[relative] = source.read(name)
        if not {'index.html', 'sw.js', 'manifest.webmanifest'} <= files.keys() or not any(
                re.fullmatch(r'app/app(?:\.[a-f0-9]{16})?\.js', name) for name in files):
            raise ValueError('Incomplete PWA runtime')
        for name in ('_worker.js', '_routes.json', 'manifest.webmanifest'):
            files[name] = private.read(name)
    output = Path(output)
    if output.resolve() in (Path(public).resolve(), Path(protected_base).resolve()):
        raise ValueError('Output must not overwrite an input')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    try:
        with ZipFile(temporary, 'w', ZIP_DEFLATED) as archive:
            for name, content in sorted(files.items()):
                archive.writestr(name, content)
        with ZipFile(temporary) as archive:
            if archive.testzip() is not None or any(archive.read(n) != b for n, b in files.items()):
                raise ValueError('Archive verification failed')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'Pages archive verified: {len(files)} root-relative files; access wrapper preserved.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', required=True, type=Path)
    parser.add_argument('--protected-base', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    package(args.public, args.protected_base, args.output)
