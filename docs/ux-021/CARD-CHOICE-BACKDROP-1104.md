# Закрытие выбора карты тапом снаружи — 4 ноября 2026

Статус: исправлено, проверено в собранном кандидате и опубликовано во временном превью. Общая приёмка 0.21 остаётся открытой.

## Причина и исправление

Нативный HTML dialog перенаправляет ввод с backdrop на сам dialog. Общий PlayerTarget принимал такой ввод за нажатие внутри меню. Предыдущий браузерный сценарий проверял закрытие кнопкой, но не настоящий touch по backdrop.

`core/player-target.js` проверяет координаты нажатия относительно прямоугольника карточного диалога. Внешний тап закрывает диалог без команды и восстанавливает фокус. Общий consumePointerReleaseClick подавляет совместимый click после pointerdown, чтобы не активировать элемент под закрытой панелью. Пустое место внутри диалога, другие player menus, клавиатура и новая независимая pointer-последовательность сохраняют своё поведение.

## Проверки

Существующий `case/mage-brawl-browser`, сценарий `Mage Brawl loot view: Akulina dialog, sequential recipients and private square backs`, дополнен native touch/mouse, пустым местом внутри, отсутствием команды и click-through, независимой клавиатурой/следующим жестом и Escape. Остальные проверки последовательного выбора, приватности, геометрии и жизненного цикла сохранены.

- RED на предыдущем опубликованном HTML: диалог остаётся открытым после native touch (1 вместо 0).
- Chromium: 1/1 PASS, skipped 0.
- WebKit: 1/1 PASS, skipped 0.
- `case/player-target`: 3/3 PASS, skipped 0.
- Build: проверены 8 SHA256 и CRC 3 ZIP.
- SHA256 нового all-games HTML: `04086ea4d13b18025899a05dfbd63e9cbd70db4effe8252648ee7014fd1429a9`.

Один начальный запуск Chrome в sandbox завершился ошибкой среды (socket Operation not permitted); он не засчитан как PASS. Проверки выше выполнены повторно вне sandbox с разрешённым доступом.

## Evidence и границы

[Локальные материалы](../../../tmp_files/ux-021/backdrop-choice-1104/): red.log, chromium.log, webkit.log, player-target.log, artifact-check.json, каталоги chromium/webkit с результатом native touch и снимками.

Проверка покрывает общий карточный диалог и существующий Mage loot сценарий на двух браузерных движках. Она не доказывает приёмку всех панелей, физических устройств, сетей или всей игры. Текущее превью: https://seth.tail6aebd4.ts.net/ (также порт 8443 и /hod-021.html).

## Проверка публикации

Существующие Funnel routes переключены на `backdrop-choice-1104/final`; сохранены статусы до/после. Stable Pages/R2 не изменялись.

- 243 файла source ZIP совпали с текущими исходниками: 230 runtime, 2 canonical locales и 11 изменённых test files. Runtime относительно предыдущего кандидата отличается только `core/player-target.js`; companion unchanged.
- Все четыре публичные загрузки совпали побайтно: index на 443/8443, sw.js, standalone HTML (проверены все 64KiB ranges).
- Live Chromium: service worker activated; buildIdentity/cache `playroom-pwa-v0.21.0-preview.1-84a430bec66be2f8`; 15 игр; downloadProtocol 1; page errors 0; native Supabase requests 0; исходники за время проверки не менялись.
- Portrait390×844 и landscape844×390: overflow false. Портретный снимок просмотрен.
- Два ответа `/api/packs/catalog` 404 отражают известное ограничение статического Funnel, а не успешную проверку сервиса каталога; встроенные 15 паков доступны. Реальные сети/устройства/OS Push этим не подтверждены.

Evidence: `source-state.json`, `public-check.json`, `funnel-before.txt`, `funnel-after.txt`, `live-pwa/chromium-report.json` и снимки в той же папке.
