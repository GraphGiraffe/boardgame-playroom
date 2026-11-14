# Видимый выбор при повороте открытой панели — 4 ноября 2026

Статус: исправлено, проверено и опубликовано во временном превью. Полная GOAL0.21 остаётся открытой.

## Изменение

После [раскрытия текущего выбора при открытии](AVATAR-REVEAL-1104.md) оставался случай изменения размера уже открытой панели. Новая проверка воспроизвела RED: фокус сохранился на пункте35, но его top≈603/bottom≈651 оказались ниже scrollport≈169–407 после уменьшения высоты. Выбор не терялся, однако активный пункт становился невидимым.

В PlayroomDOM добавлен общий trackScrollportFocus. Он запоминает, был ли сфокусированный элемент виден в своём scrollport, и при ResizeObserver/window resize/visualViewport resize возвращает его в видимую область через существующий revealInScrollport. Обработка объединяется в один requestAnimationFrame, не меняет фокус и не прокручивает предков.

Если пользователь уже прокрутил список к другим вариантам и фокус оказался вне видимой области, последующий resize не возвращает список к прежнему фокусу. При новом фокусе/прокрутке запоминается фактическое состояние. Подписка принадлежит dropdown или picker аватара; проверяется активность поверхности, а при dispose отключаются observer, listeners и запланированный frame. Suspended/отсоединённая панель не раскрывает прежний выбор поверх другого экрана.

Подключены только общие dropdown и picker аватара. Это не изменение игрового скролла, выбора карт, правил или фоновой логики партии.

## Проверки

- До исправления расширенный `select choices reveal current and keyboard options without scrolling the underlying screen` — RED с указанными координатами.
- После исправления этот case: Chromium1/1 и WebKit1/1 PASS. Текущий35-й из45пунктов остаётся сфокусированным и полностью внутри списка при390×640→844×390→320×568→390×844. Родительский scrollTop130 сохранён.
- Отдельно список вручную программно прокручен к началу, фокус35 оставлен за краем; после resize scrollTop остаётся0. Это проверка семантики scroll, не физического wheel-жеста.
- Сохранены disabled0/44, Home/End/ArrowDown/ArrowUp, видимые цели, ровно один input/change, возвращение фокуса и отсутствие движения исходного экрана.
- Настоящий `appearance gallery callers retain avatar drafts and invalidate a picker with its source` на окончательной PWA: Chromium1/1 и WebKit1/1 PASS. После повторного открытия последний реальный аватар сохраняет focus и попадание внутрь scrollport при390×844→320×568→844×390, затем при изменении root font24→16px. Черновик имени, отмена, возврат фокуса и invalidation после смены владельца сохранены. Font задан стилем корня, это не системная настройка физического телефона.
- git diff --check для итоговых изменений: exit0. Build8SHA256/3ZIP CRC/source248runtime-locale-test файлов совпали. Runtime изменён только в avatar-picker.js,game-screen.js,dom.js;227остальных файлов, canonical locales, pack sources и installed companion прежние.

Проверки подтверждают указанные компоненты и viewport-переходы, не все scroll containers приложения и не отсутствие любых утечек памяти при продолжительной эксплуатации. Освобождение новой подписки реализовано в существующих onDispose/cleanup; бессрочного polling нет.

## Публикация

HTML SHA256 `64489b3941596434b47f9cd4d8ec92ffd08c5c75c23d24d00b797977ef3e8236`.

Cache `playroom-pwa-v0.21.0-preview.1-b7ce82c9033703ea`; companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`. Разрешённые временные Funnel443/8443 и `/hod-021.html` обновлены. Четыре публичных файла побайтно совпали; standalone проверен полностью64KiB ranges с206/Content-Range/length.

Live Chromium: worker activated, ожидаемые cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Известные404/offline failures `/api/packs/catalog` относятся к static Funnel, встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Evidence](../../../tmp_files/ux-021/selection-resize-1104/): avatar-chromium/webkit.log,dropdown-chromium/webkit.log,chromium/webkit screenshots,source-state.json,final-manifest.json,own-changes.patch,executed-appearance.test.cjs,executed-layout.test.cjs,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json. RED сохранён в результате команды/координатах выше; отдельный red.log не создавался.

Остаются общая A01–A36 приёмка, прочие поверхности/игры/роли/сети, реальная экранная клавиатура и browser pinch zoom, физические устройства/AT/независимая usability и остаточная производительность. Эта правка закрывает названный пробел открытого picker после поворота в проверенной матрице, не всю0.21 и не будущий SDK.
