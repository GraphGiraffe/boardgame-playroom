# Разработка и QA RC6: окружение, сборка, CI и диагностика

[← Оглавление](DEVELOPMENT.md) · [Архитектура](DEV-ARCHITECTURE.md) · [UI](DEV-UI.md) · [P2P](DEV-NETWORK.md) · [Паки и сохранения](DEV-STORAGE-PACKS.md)

Реальные инструкции в [`AGENTS.md`](../AGENTS.md), [`CONTRIBUTING.md`](../CONTRIBUTING.md), [`scripts/codex/setup.sh`](../scripts/codex/setup.sh), [`scripts/codex/check.sh`](../scripts/codex/check.sh), [`build.py`](../build.py). Этот документ относится к исходникам RC6 в `dev` @ `afe8b9d701308824d3133177a67855419543f592` и опубликованному тегу `v0.15.0-rc.6` с релизным SHA `8fef7853e37f4f7de9163ab016a09ef36ff6373b`.

## Как продолжить работу в новом чате или на другой машине

1. Сверить актуальный `dev`, последнюю [GitHub Pre-release](https://github.com/GraphGiraffe/boardgame-playroom/releases), текущий PR и изменённые файлы. Содержательная точка отсчёта этого справочника — RC6; если `dev` изменился, читать свежий исходный код.
2. Открыть [`DEVELOPMENT.md`](DEVELOPMENT.md) и раздел, соответствующий задаче. Старые `ROADMAP.md`/handoff — планы, а не доказательство реализованного.
3. Составить карту границ: `core` / `app` / отдельный игровой пак / `RoomService` / `SessionAuthority` / WebRTC transport / `SharedViews`.
4. Делать работу в отдельной feature/fix/docs ветке от `dev` → Draft PR → проверки текущего SHA → Ready → squash merge в `dev`. `main` — стабильная линия; опубликованные RC не переписывать.
5. Разделять лабораторные Chromium-проверки и реальные эксперименты на Android. Зелёный CI не означает подтверждённую физическую работу камеры/микрофона на всех устройствах.

## Команды разработчика

```bash
# Установка locked npm dependencies, Chromium и генерация dev-файлов:
bash scripts/codex/setup.sh

# С отдельным репозиторием игровых паков:
bash scripts/codex/setup.sh --packs-dir ../boardgame-playroom-paks/packs

# Проверки независимого приложения (ядро, UI, network, сборка):
bash scripts/codex/check.sh

# Полная проверка при наличии пяти source packs:
bash scripts/codex/check.sh --full --packs-dir ../boardgame-playroom-paks/packs

# Прогон независимо указанных app-тестов:
npm run test:app

# Все тесты (когда подготовлены исходники паков):
npm test

# Dev-сервер localhost:
bash scripts/codex/serve.sh

# Standalone HTML + все игры + installable PWA:
python3 build.py --packs-dir ../boardgame-playroom-paks/packs --all-games --pwa --output-dir dist
```

`setup.sh` выполняет `npm ci` и при необходимости устанавливает Chromium для `playwright-core`, создаёт `installed-packs.js` для локальной работы. `check.sh` проверяет синтаксис JS/Bash/Python, `build.py` и Node/Chromium тесты. Файлы `packs/`, `installed-packs.js` и `dist/` генерируются и не попадают в Git.

## Карта тестов и обязательных регрессий

| Меняется… | Основные тесты | Инвариант |
| --- | --- | --- |
| Engine/Session/authority | [`engine.test.cjs`](../tests/engine.test.cjs), [`session.test.cjs`](../tests/session.test.cjs), [`authority.test.cjs`](../tests/authority.test.cjs) | Легальность действий, неизменяемость истории, личные проекции |
| Боты/реакции/UNO | [`uno-reactions.test.cjs`](../tests/uno-reactions.test.cjs), [`quick-play.test.cjs`](../tests/quick-play.test.cjs) | Off-turn реакции, нет самопроизвольных/незаконных ходов |
| Локальное хранение/паковые версии | [`packs-reconcile.test.cjs`](../tests/packs-reconcile.test.cjs), [`recovery-warning.test.cjs`](../tests/recovery-warning.test.cjs), [`session.test.cjs`](../tests/session.test.cjs) | Старые сохранения/версии не удаляются |
| UI, жесты, анимация | [`drag-app.test.cjs`](../tests/drag-app.test.cjs), [`uno-hand-size.test.cjs`](../tests/uno-hand-size.test.cjs), [`compact-hand.test.cjs`](../tests/compact-hand.test.cjs), [`motion-settings.test.cjs`](../tests/motion-settings.test.cjs) | Tap/drag/swipe, ширина 320/390 px, история, quickPlay |
| Лобби и двухсторонний WebRTC | [`multiplayer-lobby.test.cjs`](../tests/multiplayer-lobby.test.cjs), [`webrtc-browser.test.cjs`](../tests/webrtc-browser.test.cjs), [`network-main-app.test.cjs`](../tests/network-main-app.test.cjs), [`network-same-origin.test.cjs`](../tests/network-same-origin.test.cjs) | Два клиента, закрытие pending PeerConnection, права host |
| PR3, ICE, звук | [`pairing.test.cjs`](../tests/pairing.test.cjs), [`acoustic-pairing.test.cjs`](../tests/acoustic-pairing.test.cjs), [`acoustic-webrtc-browser.test.cjs`](../tests/acoustic-webrtc-browser.test.cjs) | Декодирование DTLS/ICE, TEST-NET fallback, совместимость PR2 |
| Фото QR и offline | [`qr-pairing-browser.test.cjs`](../tests/qr-pairing-browser.test.cjs), [`pwa.test.cjs`](../tests/pwa.test.cjs) | Настоящий PNG с PR3 читается локальным jsQR без BarcodeDetector и CDN |
| Идентификация/reconnect | [`network-resume.test.cjs`](../tests/network-resume.test.cjs), [`network-reconnect-browser.test.cjs`](../tests/network-reconnect-browser.test.cjs), [`network-same-origin.test.cjs`](../tests/network-same-origin.test.cjs) | Токен ротируется, старый канал отзывается, reload гостя в UNO сохраняет viewer/место |
| Звуки/объявления | [`game-feedback.test.cjs`](../tests/game-feedback.test.cjs), [`network-feedback-browser.test.cjs`](../tests/network-feedback-browser.test.cjs) | События/звук только новых ревизий, без дублей от replay/reconnect |

После изменения `SessionAuthority` или договорённостей RoomService/transport требуется **full** проверка приложения и всех паков; старые passed checks не подтверждают новый SHA. Для docs-only PR достаточно проверки Markdown/ссылок и действующей проверки приложения, без искусственного запуска релизной сборки.

## Автоматические GitHub Actions

- [`Application checks`](../.github/workflows/ci.yml): событие `pull_request.ready_for_review` к `dev/main` или `workflow_dispatch`. Запускает `setup.sh` + `check.sh` для независимого приложения.
- [`Multiplayer preview smoke`](../.github/workflows/multiplayer-smoke.yml): `pull_request.ready_for_review` к `dev` / `workflow_dispatch`. Берёт закреплённые игровые сборки, выполняет legacy-layout и Two-device release gate (включая QR/reconnect), собирает HTML и PWA и проверяет final previews.
- [`Pinned app and packs integration`](../.github/workflows/integration.yml): отдельная совместная проверка исходных паков по контрактам соответствующего workflow.
- Релиз RC6 использует **`release/publish-v0.15.0-rc.6` / `.github/workflows/rc6-publish.yml`**, а не только `dev`. Там закреплены UNO 0.2.1 и четыре остальных пака, выполняется полный `check.sh --full`, проходят HTML/PWA smoke и проверка SHA256, после чего создаётся GitHub Pre-release с точным target SHA.

**Историческая деталь CI:** `multiplayer-smoke.yml` в `dev` до сих пор присваивает некоторым preview артефактам имя `0.15.0-rc.2`. Это имя **не означает**, что опубликованный RC6 содержит код RC2: использовать tag/release workflow/проверенный SHA и asset names. При отдельной будущей чистке workflow metadata можно сделать имена preview нейтральными.

## Создаваемые сборкой файлы

| Путь | Содержание |
| --- | --- |
| `dist/playroom.html` | Single-file HTML/JS/CSS приложения без загруженных игровых паков |
| `dist/playroom-all-games.html` | Single-file с пятью выбранными паками (при `--all-games`) |
| `dist/playroom-source.zip` | Исходные JS/CSS, скрипты, тесты и `docs/` |
| `dist/tabletop-core.zip` | Независимое ядро |
| `dist/pwa/` и `dist/playroom-pwa.zip` | Installable HTTPS PWA с кешируемыми ресурсами |
| `dist/SHA256SUMS` | Контрольные суммы generated outputs |

Проверять **финальные** файлы, не только staging: наличие `app/vendor/jsqr.js`, `app/vendor/qrcode.js`, `app/vendor/ggwave.js`, всех лицензий и `app/qr-scanner.js`; точный `packVersion`; манифест, кэш service worker, встраивание скриптов и SHA256.

## Приёмка на физических устройствах

1. Два Android или Android/Windows в одной Wi-Fi сети. Сначала без VPN; выбрать реальный Wi-Fi IP, не TEST-NET.
2. Один показывает Offer PR3 QR, второй внутри PlayRoom нажимает «Сфотографировать QR» и получает Answer; хост также сканирует Answer **внутри приложения** без копирования текста.
3. Проверить лобби, место, чужие скрытые карты, ход/эффект/звук, настройки анимаций/quickPlay, штрафы UNO и завершение.
4. Оставив браузер **хоста** открытым, перезагрузить браузер **клиента** во время партии. Через новый Offer/Answer проверить тот же participant ID, seat/viewer, сохранённую личную руку и ротацию приватного секрета.
5. Отдельно проверить ошибочное фото, галерею, PR2 fallback, две вкладки одного origin и невозможность забрать чужое место без секрета. Повторить с VPN (если доступна LAN-маршрутизация), `content://` и HTTPS/PWA.

Ограничение: микрофон через `content://` может возвращать `Permission denied`, хотя фотография через системную камеру и Canvas работает. Успех Chromium CI не отменяет необходимости проверки реального Android RC6.

## Диагностика типичных ошибок

| Симптом | Начать с |
| --- | --- |
| Пустая страница или не появилась форма профиля | Порядок `index.html`, ошибки script загрузки, `app/app.js`/`PlayroomAppBridge`, `recovery-warning.test.cjs` |
| Только `192.0.2.1` в ICE | `Acoustic.allCandidates`, `probeAddresses`, VPN/mDNS, реальный ручной IPv4 |
| PR3 QR не читается | `app/qr-scanner.js`, `jsQR` / `BarcodeDetector`, MIME/Canvas, тип Offer/Answer |
| `Permission denied` на звуке | `Acoustic.microphoneIssue`, HTTPS PWA и разрешение микрофона |
| WebRTC не подключается | `pairingId`, ICE/UDP, Wi-Fi client isolation, `waitIce/waitOpen` и `PlayroomNetworkDebug` |
| Клиент вернулся зрителем вместо прежнего игрока | `ResumeStore.load`, `RoomService.resume`, `connectionLeases`, `hostPeerServing` |
| Чужая рука видна игроку | Срочно проверить `Core.project`, `SessionAuthority._snapshot`, `connect(viewer)` |
| Повтор уведомления после refresh/reconnect | `SessionClient.accept`, `GameFeedback.cursor`, `GameFlow.eventAction` |
| Старое сохранение требует отсутствующий пак | Точный `packVersion`, `TabletopPacks.bootstrap`, `PlayroomLibrary.references` |

**Документационный handoff:** после задачи фиксировать SHA, PR, точный CI, изменённые wire/storage schemas, реально проверенные платформы и невыполненные условия. Ни зелёный PR-CI, ни слитый PR сами по себе не означают опубликованный RC; проверять release tag и четыре asset файла отдельно.
