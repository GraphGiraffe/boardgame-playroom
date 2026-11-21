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

Для проверки точного набора паков из разных источников передайте `PLAYROOM_TEST_INSTALLED_PACKS` с путём к доверенному `installed-packs.js`, сгенерированному из JSON с проверенными SHA-256. Этот вход используется Node-тестами на базе `tests/sdk-installed.cjs`. Для браузерных сценариев `sdk-player-browser.test.cjs` передайте автономную сборку через `PLAYROOM_SDK_PLAYER_HTML`.

## Приглашения WebRTC на телефонах

Для входа в лобби используйте одну и ту же автономную сборку в двух прогонах.
Первый профиль соответствует Pixel 7 в Chromium. Второй соответствует
iPhone 15 в WebKit. В каждом прогоне клиент соединяется с хостами обоих
браузеров, получает повторный ответ, занимает место и видит первый ход.

```sh
PLAYROOM_TEST_BROWSER=chromium PLAYROOM_TEST_ARTIFACT=/path/to/playroom-all-games.html node scripts/codex/test.cjs case/network-main-app --name 'mobile invitation tolerates duplicate replies'
PLAYROOM_TEST_BROWSER=webkit PLAYROOM_TEST_ARTIFACT=/path/to/playroom-all-games.html node scripts/codex/test.cjs case/network-main-app --name 'mobile invitation tolerates duplicate replies'
```

Для транспорта используйте `case/webrtc-browser` и передайте тот же HTML
через `WEBRTC_ARTIFACT`. Эти проверки используют настоящий DataChannel
на loopback. Приём по микрофону, сеть между телефонами и мобильный Safari
проверяются на физических устройствах. WebKit должен быть доступен для
установленной версии Playwright.
