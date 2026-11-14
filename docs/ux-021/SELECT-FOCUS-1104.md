# Выбранный пункт собственного dropdown — 4 ноября 2026

Статус: исправлено, проверено в Chromium/WebKit и опубликовано во временном превью. Общая GOAL0.21 остаётся открытой.

## Причина и результат

В общем GameScreen.openSelectChoice применялся querySelector с объединённым селектором «выбранный пункт, любой доступный пункт». Такой запрос возвращает первый подходящий элемент в DOM, а не отдаёт предпочтение первому селектору. Поэтому после открытия фокус всегда получал первый доступный пункт, даже если текущее значение находилось дальше. Дополнительно focus({preventScroll:true}) не открывал его в прокручиваемом списке.

Теперь приоритет задан явно: найденный по начальной букве → текущий выбранный → первый доступный. Один внутренний focusChoice используется при открытии и для ArrowUp/ArrowDown/Home/End/поиска по букве. Он меняет scrollTop только собственного списка, учитывая scroll-padding, border и масштаб его прямоугольника; native scrollIntoView для всех предков больше не используется. Исходный экран и его прокрутка остаются на месте. После выбора фокус возвращается к исходному контролу.

Это изменение поведения общего picker, а не новое общее выделение на телефоне. CSS input modality и игровые индикации не менялись. При чтении application CSS найдены только два ungated focus-правила с outline/shadow/border: игровые accuse/player-target-confirm; они сохранены согласно решению владельца. Такая выборка не является полной визуальной приёмкой всех состояний.

## Проверки

Новый case в существующем game-layout-browser: `select choices reveal current and keyboard options without scrolling the underlying screen`.

- До исправления RED: выбран35-й пункт из45, но document.activeElement относится к первому доступному пункту1.
- После исправления Chromium1/1 PASS и WebKit1/1 PASS: фокус35, список прокручен, пункт целиком внутри scrollport с отступом; Home→1, End→43, ArrowDown→1, ArrowUp→43 пропускают disabled0/44 и сохраняют пункт в видимой области.
- Enter выбирает43 и порождает ровно один input и один change. Родительский scrollTop остаётся130, после закрытия document.activeElement — исходный select. Ошибок JS нет.
- Новый case использует реальную реализацию и stylesheet приложения с синтетическими45вариантами. Это проверка общего компонента, а не утверждение, что в конкретной игре есть45настроек.
- На окончательной PWA выполнен настоящий `appearance gallery 0.21 owns its draft and preserves settings, scene and foreground lifetime`: Chromium1/1 и WebKit1/1 PASS. Покрыты touch-открытие picker, выбор текущего значения без повторного change, outside-dismiss/Back, родительские формы, черновики оформления, фокус и сцена/ревизия партии. Остальные исходные проверки этого case сохранены.
- git diff --check для итоговых runtime/test/doc изменений: exit0. Build8SHA256/3ZIP CRC,247runtime/locale/test файлов source ZIP совпали. Из230runtime-файлов изменён только app/game-screen.js; canonical locales, pack sources и installed companion прежние.

## Опубликованное состояние

HTML SHA256 `8de233c5f5056ec967b93262185686e0a2667458ff41a7609bbe24a09ec74492`.

PWA cache `playroom-pwa-v0.21.0-preview.1-940cbdbabb904fa9`; companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`. Временные Funnel443/8443 и `/hod-021.html` обновлены. Четыре публичных ответа побайтно совпали с локальной сборкой, standalone проверен полностью64KiB ranges с206/Content-Range/length.

Live Chromium: ожидаемые activated/cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Известные404/offline failures `/api/packs/catalog` относятся к static Funnel; встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Материалы](../../../tmp_files/ux-021/select-focus-1104/): source-state.json,final-manifest.json,own-changes.patch,executed-game-layout.test.cjs,appearance-chromium.log,appearance-webkit.log,chromium/webkit appearance reports/screenshots,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json. Первичный RED сохранён в тексте результата выше; отдельный red.log не создавался.

## Осталось

Это не полная проверка всех рамок, доступности, размеров текста, экранных клавиатур и физических устройств. Масштаб и inset учитываются механизмом, но новый45option-case выполнен при390×640; прочие размеры имеют свои предыдущие адресные evidence. Общая A01–A36 приёмка, производительность, все игровые/сетевые состояния, AT и самостоятельная обнаружимость действий человеком остаются открытыми.
