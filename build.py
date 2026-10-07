#!/usr/bin/env python3
"""Собрать автономный Playroom без игр; отдельно подключить внешние паки."""

import argparse
import base64
import hashlib
import json
import mimetypes
from pathlib import Path
import re
import struct
import zlib
import zipfile


ROOT = Path(__file__).resolve().parent
ASSET_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)
ATTR = re.compile(r"([\w-]+)\s*=\s*(['\"])(.*?)\2", re.DOTALL)
# Portable format 1: keep these checks aligned with core/packs.js.
MAX_PACK_BYTES = 4 * 1024 * 1024
MAX_PACK_FILES = 128
MAX_SAFE_INTEGER = 9007199254740991
TEXT_EXTENSIONS = {".css", ".js", ".json", ".md", ".svg", ".txt"}
ID = re.compile(r"[a-z][a-z0-9_-]{0,63}", re.ASCII)
SEMVER = re.compile(
    r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
    r"(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?", re.ASCII)
DATA_URL = re.compile(
    r"data:(?:(?:image|audio|font)/[\w.+-]+|application/(?:octet-stream|json|font-[\w-]+))"
    r"(?:;[\w=.+-]+)*(?:;base64)?,", re.IGNORECASE | re.ASCII)
PACK_ASSET_URL = re.compile(r"url\(\s*(?:(['\"])(.*?)\1|([^)]*))\s*\)", re.IGNORECASE | re.DOTALL)
ENTRY_POINTS = {"rules": "rules.js", "view": "view.js", "styles": "styles.css"}


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"


def parse_json(text):
    def invalid_constant(value):
        raise ValueError(f"Недопустимое значение JSON: {value}")
    return json.loads(text, parse_constant=invalid_constant)


def path_ok(name):
    return (isinstance(name, str) and len(name) <= 180 and not name.startswith("/") and "\\" not in name
            and all(part not in {"", ".", ".."} and re.fullmatch(r"[A-Za-z0-9_. -]+", part)
                    for part in name.split("/")))


def number_equals(value, expected):
    return type(value) in (int, float) and value == expected


def js_trim(value):
    return value.strip("\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff")


def validate_manifest(manifest, label):
    if not isinstance(manifest, dict):
        raise ValueError(f"Нет manifest: {label}")
    ident, version = manifest.get("id"), manifest.get("version")
    if not isinstance(ident, str) or not ID.fullmatch(ident) or not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise ValueError(f"Некорректные ID/версия пака: {label}")
    state = manifest.get("stateVersion")
    if (not number_equals(manifest.get("engineApi"), 1) or type(state) not in (int, float)
            or not 1 <= state <= MAX_SAFE_INTEGER or int(state) != state):
        raise ValueError(f"Неподдерживаемый API/состояние пака: {label}")
    name = manifest.get("name")
    if not isinstance(name, str) or not js_trim(name) or len(name.encode("utf-16-le", "surrogatepass")) // 2 > 120:
        raise ValueError(f"Нет названия пака или оно длиннее 120 символов: {label}")
    for key, filename in {**ENTRY_POINTS, "sounds": "sounds.js"}.items():
        if key in manifest and manifest[key] != filename:
            raise ValueError(f"Неподдерживаемая точка входа {key}: {label}")
    return manifest


def validate_asset(files, name):
    if not path_ok(name) or name not in files:
        raise ValueError(f"Ресурс отсутствует в паке: {name}")
    value = files[name]
    if re.match(r"data:", value, re.IGNORECASE):
        if not DATA_URL.match(value):
            raise ValueError(f"Неподдерживаемый встроенный ресурс: {name}")
    elif Path(name).suffix.lower() not in TEXT_EXTENSIONS:
        raise ValueError(f"Двоичный ресурс должен быть data URL: {name}")


def validate_bundle(bundle, label, raw=None):
    text = json_text(bundle) if raw is None else raw
    if len(text.encode("utf-8")) > MAX_PACK_BYTES:
        raise ValueError(f"Пак больше 4 MiB: {label}")
    if not isinstance(bundle, dict) or bundle.get("format") != "playroom-pack" or not number_equals(bundle.get("formatVersion"), 1):
        raise ValueError(f"Некорректный формат пака: {label}")
    manifest = validate_manifest(bundle.get("manifest"), label)
    files = bundle.get("files")
    if not isinstance(files, dict) or len(files) > MAX_PACK_FILES:
        raise ValueError(f"Нет files или в паке больше 128 файлов: {label}")
    for name, value in files.items():
        if not path_ok(name) or not isinstance(value, str):
            raise ValueError(f"Недопустимый файл пака: {label}")
        if Path(name).suffix.lower() not in TEXT_EXTENSIONS:
            validate_asset(files, name)
    for key, filename in ENTRY_POINTS.items():
        if filename not in files or not js_trim(files[filename]):
            raise ValueError(f"Нет {filename} в паке: {label}")
    if manifest.get("sounds") and not files.get("sounds.js"):
        raise ValueError(f"Нет sounds.js в паке: {label}")
    css = files["styles.css"]
    uncommented = re.sub(r"/\*[\s\S]*?\*/", "", css)
    if re.search(r"@import\b|expression\s*\(", uncommented, re.IGNORECASE):
        raise ValueError(f"CSS пака не должен загружать внешние стили: {label}")
    for match in PACK_ASSET_URL.finditer(css):
        url = js_trim(match.group(2) if match.group(1) else match.group(3))
        if url.startswith("#"):
            continue
        if re.match(r"data:", url, re.IGNORECASE):
            if not re.match(r"data:(?:image|font|application)/", url, re.IGNORECASE):
                raise ValueError(f"Неподдерживаемый CSS ресурс: {label}")
        else:
            validate_asset(files, url[2:] if url.startswith("./") else url)
    return bundle



def local_file(reference, owner, root=ROOT):
    """Resolve local resources without fetching or following external links."""
    if re.match(r"^(?:[a-z][a-z0-9+.-]*:|//)", reference, re.IGNORECASE) or "\\" in reference:
        raise ValueError(f"Внешний ресурс нельзя встроить: {reference}")
    path = owner.parent / reference.split("?", 1)[0].split("#", 1)[0]
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"Нет локального ресурса: {reference} ({owner.name})")
    return path.resolve()


def inline_css(path):
    def replace_asset(match):
        reference = match.group(2).strip()
        if reference.startswith(("data:", "#")):
            return match.group(0)
        asset = local_file(reference, path)
        mime = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(asset.read_bytes()).decode("ascii")
        return f'url("data:{mime};base64,{encoded}")'
    css = path.read_text(encoding="utf-8")
    if re.search(r"@import\b", css, re.IGNORECASE):
        raise ValueError(f"Укажите стили в index.html вместо CSS @import: {path.name}")
    return ASSET_URL.sub(replace_asset, css)


def installed_script(packs):
    return "// Generated by build.py; local development data, never source code.\n" + "globalThis.PlayroomInstalledPacks = " + json.dumps(packs, ensure_ascii=False, separators=(",", ":")) + ";\n"


def bundle_html(packs=()):
    index = ROOT / "index.html"
    source = index.read_text(encoding="utf-8")
    def replace_link(match):
        attributes = {key.lower(): value for key, _, value in ATTR.findall(match.group(0))}
        if attributes.get("rel", "").lower() != "stylesheet":
            return match.group(0)
        path = local_file(attributes["href"], index)
        css = re.sub(r"</style", r"<\\/style", inline_css(path), flags=re.IGNORECASE)
        return f"<style>\n/* {path.relative_to(ROOT)} */\n{css}\n</style>"
    def replace_script(match):
        reference = match.group(2)
        script = installed_script(list(packs)) if reference == "installed-packs.js" else local_file(reference, index).read_text(encoding="utf-8")
        script = re.sub(r"</script", r"<\\/script", script, flags=re.IGNORECASE)
        return f"<script>\n// {reference}\n{script}\n</script>"
    source = re.sub(r"<link\b[^>]*>", replace_link, source, flags=re.IGNORECASE)
    return re.sub(r"<script\b[^>]*\bsrc\s*=\s*(['\"])(.*?)\1[^>]*>\s*</script\s*>", replace_script, source, flags=re.IGNORECASE | re.DOTALL)


def read_source_pack(manifest_path):
    manifest = validate_manifest(parse_json(manifest_path.read_text(encoding="utf-8")), manifest_path.parent.name)
    pack = manifest_path.parent
    paths = {local_file(filename, manifest_path, pack) for filename in ENTRY_POINTS.values()}
    if manifest.get("sounds") or (pack / "sounds.js").is_file():
        paths.add(local_file("sounds.js", manifest_path, pack))
    for folder in ("assets", "config"):
        if (pack / folder).is_dir():
            paths.update(local_file(path.relative_to(pack).as_posix(), manifest_path, pack) for path in (pack / folder).rglob("*") if path.is_file())
    paths.update(local_file(path.name, manifest_path, pack) for path in pack.glob("*.json") if path.name != "manifest.json")
    files = {}
    for path in sorted(paths):
        if path.suffix.lower() in TEXT_EXTENSIONS:
            value = path.read_text(encoding="utf-8")
        else:
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            value = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
        files[path.relative_to(pack).as_posix()] = value
    return validate_bundle({"format":"playroom-pack", "formatVersion":1, "manifest":manifest, "files":files}, pack.name)


def read_packs(directory):
    directory = directory.resolve()
    if not directory.is_dir():
        raise ValueError(f"Нет каталога паков: {directory}")
    manifests = sorted(directory.glob("*/manifest.json"))
    source_root = directory if manifests else None
    if manifests:
        bundles = [read_source_pack(path) for path in manifests]
    else:
        bundles = []
        for path in sorted(directory.glob("*.playroom-pack.json")):
            raw = path.read_text(encoding="utf-8")
            if len(raw.encode("utf-8")) > MAX_PACK_BYTES:
                raise ValueError(f"Пак больше 4 MiB: {path.name}")
            bundles.append(validate_bundle(parse_json(raw), path.name, raw))
    if not bundles:
        raise ValueError("Укажите каталог с исходными папками паков или готовыми *.playroom-pack.json")
    ids = [bundle["manifest"]["id"] for bundle in bundles]
    if len(ids) != len(set(ids)):
        raise ValueError("В каталоге повторяется ID пака; оставьте одну версию каждого")
    return bundles, source_root


def prepare_dev(packs, source_root):
    link = ROOT / "packs"
    if source_root:
        if link.exists() and not link.is_symlink():
            raise ValueError("packs/ уже является обычным каталогом; существующие файлы не изменены")
        if link.is_symlink() and link.resolve() != source_root:
            link.unlink()
        if not link.is_symlink():
            link.symlink_to(source_root, target_is_directory=True)
    (ROOT / "installed-packs.js").write_text(installed_script(packs), encoding="utf-8")
    ensure_dev_icons()
    print(f"Для index.html подготовлено паков: {len(packs)}; installed-packs.js и PNG-иконки не входят в исходники приложения.")


def source_files():
    """No game packs, generated preload, symlinks, saves or artifacts enter this archive."""
    paths = {ROOT / name for name in ("index.html", "build.py", "build.sh", "README.md", "manifest.webmanifest", "sw.js") if (ROOT / name).is_file()}
    for name in ("package.json", "package-lock.json", ".gitignore", ".gitattributes", "CONTRIBUTING.md", "CHANGELOG.md", "AGENTS.md", ".nvmrc"):
        if (ROOT / name).is_file():
            paths.add(ROOT / name)
    for pattern in ("app/*.js", "app/*.css", "app/transports/*.js", "icons/*.svg", "dev/*.js", "dev/*.cjs", "dev/*.html", "dev/*.py", "core/*.js", "core/*.css", "core/*.json", "core/*.md", "docs/*.md", "tests/*.cjs", "scripts/codex/*.sh", "scripts/codex/*.cjs", "app/AGENTS.md", "core/AGENTS.md", "tests/AGENTS.md", "scripts/AGENTS.md", "scripts/codex/AGENTS.md", ".github/workflows/*.yml", ".github/workflows/*.yaml"):
        paths.update(ROOT.glob(pattern))
    for path in sorted(paths):
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"Недопустимый исходный файл приложения: {path}")
        yield path



def png_icon(size):
    background=(243,240,231,255)
    colors=[(73,107,87,255),(229,121,94,255),(237,189,89,255),(169,185,217,255)]
    margin=round(size*0.238); gap=max(4,round(size*0.047)); side=round(size*0.238); radius=max(4,round(size*0.058))
    cells=[(margin,margin),(margin+side+gap,margin),(margin,margin+side+gap),(margin+side+gap,margin+side+gap)]
    pixels=bytearray(background*size*size)
    def inside_rounded(px,py,x,y,w,h,r):
        if x+r<=px<x+w-r or y+r<=py<y+h-r:return x<=px<x+w and y<=py<y+h
        cx=x+r if px<x+r else x+w-r-1; cy=y+r if py<y+r else y+h-r-1
        return (px-cx)**2+(py-cy)**2<=r*r
    for (x,y),color in zip(cells,colors):
        for py in range(max(0,y),min(size,y+side)):
            for px in range(max(0,x),min(size,x+side)):
                if inside_rounded(px,py,x,y,side,side,radius):
                    offset=(py*size+px)*4; pixels[offset:offset+4]=bytes(color)
    raw=b''.join(b'\x00'+bytes(pixels[row*size*4:(row+1)*size*4]) for row in range(size))
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')


def generated_icons():
    return [('icons/icon-192.png',png_icon(192)),('icons/icon-512.png',png_icon(512))]


def ensure_dev_icons():
    for name,content in generated_icons():
        path=ROOT/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content)


def pwa_runtime_items(packs=()):
    """Return a static HTTPS-hostable PWA bundle with generated installed packs."""
    paths = {ROOT / "index.html", ROOT / "manifest.webmanifest", ROOT / "sw.js"}
    for pattern in ("app/*.js", "app/*.css", "app/transports/*.js", "core/*.js", "core/*.css", "icons/*.svg"):
        paths.update(ROOT.glob(pattern))
    items = []
    for path in sorted(paths):
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise ValueError(f"Недопустимый PWA-файл: {path}")
        items.append((path.relative_to(ROOT).as_posix(), path.read_bytes()))
    items.append(("installed-packs.js", installed_script(list(packs)).encode("utf-8")))
    items.extend(generated_icons())
    return items


def write_directory(destination, items):
    for name, content in items:
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

def write_zip(destination, items):
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(items):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100755 if name.endswith(".sh") else 0o100644) << 16
            archive.writestr(info, content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist", help="Каталог результата (по умолчанию: dist/ рядом со скриптом)")
    parser.add_argument("--packs-dir", type=Path, help="Внешний каталог packs/ с manifest.json или dist/ с *.playroom-pack.json")
    parser.add_argument("--all-games", action="store_true", help="Дополнительно собрать playroom-all-games.html из --packs-dir")
    parser.add_argument("--pwa", action="store_true", help="Дополнительно собрать installable PWA-каталог и playroom-pwa.zip")
    parser.add_argument("--prepare-dev", action="store_true", help="Создать installed-packs.js для index.html и ссылку packs/ для локальных тестов")
    args = parser.parse_args()
    if args.all_games and not args.packs_dir:
        parser.error("Для --all-games требуется явный --packs-dir")
    if args.packs_dir and not (args.all_games or args.prepare_dev or args.pwa):
        parser.error("Выберите --all-games, --pwa или --prepare-dev для указанных паков")
    packs, source_root = read_packs(args.packs_dir) if args.packs_dir else ([], None)
    if args.prepare_dev:
        prepare_dev(packs, source_root)
        if not args.all_games:
            return
    files = list(source_files())
    html = bundle_html()
    complete_html = bundle_html(packs) if args.all_games else None
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    page, archive, core_archive = output / "playroom.html", output / "playroom-source.zip", output / "tabletop-core.zip"
    page.write_text(html, encoding="utf-8")
    write_zip(archive, [("playroom/" + path.relative_to(ROOT).as_posix(), path.read_bytes()) for path in files])
    core_files = [path for path in files if path.parent == ROOT / "core"]
    core_items = [("tabletop-core/" + path.name, path.read_bytes()) for path in core_files]
    contract = ROOT / "docs" / "PACKS.md"
    if contract.is_file():
        core_items.append(("tabletop-core/docs/PACKS.md", contract.read_bytes()))
    write_zip(core_archive, core_items)
    artifacts = [page, archive, core_archive]
    if complete_html is not None:
        complete = output / "playroom-all-games.html"
        complete.write_text(complete_html, encoding="utf-8")
        artifacts.append(complete)
    if args.pwa:
        pwa_dir = output / "pwa"
        pwa_items = pwa_runtime_items(packs)
        write_directory(pwa_dir, pwa_items)
        pwa_archive = output / "playroom-pwa.zip"
        write_zip(pwa_archive, [("playroom-pwa/" + name, content) for name, content in pwa_items])
        artifacts.append(pwa_archive)
    checksums = output / "SHA256SUMS"
    checksums.write_text("".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in sorted(artifacts)), encoding="ascii")
    for path in artifacts:
        print(f"{path} ({path.stat().st_size:,} bytes)")
    print("playroom.html содержит приложение и движок. Игры устанавливаются из файлов паков.")
    if complete_html is not None:
        print(f"Для телефона со всеми {len(packs)} играми передайте только playroom-all-games.html.")
    if args.pwa:
        print(f"PWA-каталог: {output / 'pwa'}; архив: {output / 'playroom-pwa.zip'}")
        print("Для установки PWA разместите содержимое pwa/ по HTTPS (или localhost для разработки).")
    print(f"Контрольные суммы: {checksums}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(f"Ошибка сборки: {error}") from error
