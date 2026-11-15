# Локальная проверка

Нужны Python 3.11+, Node.js 22 и совместимая коллекция игр рядом с приложением в `../playroom-paks`. Подготовка из корня приложения:

```sh
bash scripts/codex/setup.sh --packs-dir ../playroom-paks/packs
```

Выбирайте проверки по изменению; сначала посмотрите список, затем запустите нужный сценарий:

```sh
node scripts/codex/test.cjs case/update-all --list
node scripts/codex/test.cjs case/update-all
```

Для UI нужен Chromium; настройка находит установленный браузер или подготавливает его. Полный набор не запускается автоматически. Локальная тестовая сборка и HTTP-сервер:

```sh
python3 build.py --all-games --pwa --packs-dir ../playroom-paks/packs --output-dir dist/local
python3 -m http.server 8000 --directory dist/local/pwa
```

Откройте `http://localhost:8000`. Игры устанавливаются из каталога или локальных JSON-паков. Тестовые файлы в `dist/` не коммитятся и не публикуются как GitHub Releases. Проверки браузерного интерфейса не заменяют проверку на физических устройствах.
