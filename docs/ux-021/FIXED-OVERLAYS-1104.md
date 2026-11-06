# Общие координаты fixed-поверхностей — 4 ноября 2026

Статус: адресное исправление реализовано, проверено и опубликовано во временном превью. Полная GOAL 0.21 остаётся открытой.

## Причина и исправление

Новый браузерный сценарий воспроизвёл смещение tooltip в Chromium при `scrollbar-gutter:stable both-edges;scrollbar-width:thin`. Источник имеет x170/width60, tooltip — x165.75/width88.5: его центр210 вместо200. Координаты `getBoundingClientRect()` уже учитывают gutter, а непосредственное присваивание CSS fixed left добавляло ещё10px. Прежние tooltip-проверки использовали страницу без root gutter и проверяли границы viewport, поэтому это расхождение не обнаруживали.

В `platform/web/dom.js` добавлен общий `positionFixed(element,{left,top})`. Скрытый sibling-probe определяет действительное начало fixed containing block и его масштаб. Один probe переиспользуется на родителя; постоянное добавление/удаление при refresh не запускает цикл MutationObserver. Геометрия читается заново, probe не принимает ввод, не получает фокус и скрыт от accessibility tree. WeakMap не удерживает удалённые порталы.

Механизм используют tooltip, оба вида некарточного PlayerTarget-menu и указатель FirstTurnGuide, в том числе внутри top-layer dialog. Частный `.guide-fixed-origin` удалён. Автоматическое размещение самого карточного dialog остаётся прежним. Независимая загрузка tooltip/PlayerTarget без DOM-модуля сохраняет прежний fallback; в приложении используется общий механизм. Контракт рассчитан на fixed-позиционирование в поддерживаемых приложением контекстах; проверка translate/scale не является заявлением поддержки любых CSS rotation/perspective.

## Проверки и границы evidence

- До исправления `case/tooltips --name 'fixed overlays share viewport coordinates with root scrollbar gutters'` — RED с фактическими координатами выше.
- После исправления новый сценарий: Chromium1/1 и WebKit1/1 PASS. Tooltip центрируется по источнику с допуском1px и сохраняет viewport margin; player overlay совпадает с карточкой по x/y/width/height; обычное меню совпадает с trigger. Проверены commit ровно один раз, outside-dismiss, aria-expanded/aria-describedby, переиспользование одного body-probe, translated/scaled portal и native dialog.
- `case/tooltips,case/player-target`: Chromium6/6 PASS, skipped0. Сохраняются проверки существующих lifecycle, touch hold, безопасного текста/арта и доступности.
- На окончательном HTML `first-turn guidance explains clipped scroll targets without moving the field or learning the action`: Chromium1/1 и WebKit1/1 PASS. В каждом случае right/left/up/down и RTL left/right, отсутствие автоматического scroll/mastery, попадание tap-указателя в центр после ручной прокрутки.
- `first-turn guide follows real Old Maid choices and both Mage planning steps`: Chromium1/1 PASS на первой сборке этой итерации. Финальная отличается только удалением лишней пустой строки CSS; JS и поведение идентичны. Это отдельно от проверок окончательного SHA выше.
- `git diff --check` для пяти runtime-файлов и tooltip-теста: exit0. Сборка, восемь SHA256, три ZIP CRC и247 runtime/locale/test файлов source ZIP совпали. Начальная попытка provenance использовала неверный путь `core/installed-packs.js`; исправлена на настоящий `installed-packs.js` и проверка выполнена успешно. Отказ sandbox к Tailscale socket не засчитан: статус повторно прочитан с ранее разрешённым доступом, службы не перезапускались.

Новый общий helper проверен по координатам; это не полная проверка всех рамок, форм, scale/zoom, устройств или всех меню приложения. Native card-choice backdrop и остальные игровые input-сценарии имеют прежнее адресное evidence, а не новый полный прогон.

## Сборка и опубликованное состояние

HTML SHA256: `dfb95f61cdccb04ae7602e177d918e85f6c79be69f2ea114bcb550e80706b932`.

PWA cache: `playroom-pwa-v0.21.0-preview.1-5fa2ea70cc1631f0`. Приложение0.21.0-preview.1, коллекция0.8.9-preview.4,15игр. Companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da` и зафиксированные pack sources прежние. Из230runtime-файлов изменены5,225прежние.

Разрешённые Funnel443/8443 и `/hod-021.html` переключены на final этой итерации. Четыре публичные загрузки побайтно совпали с локальными файлами; standalone загружен64KiB ranges с проверкой206/Content-Range/length. Live Chromium: worker activated, ожидаемые cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS,6состояний390×844/844×390 без горизонтального overflow. Просмотрен live screenshot главного экрана390×844.

Известные404 `/api/packs/catalog` на static Funnel и offline request failures этого маршрута сохранены в отчёте, встроенные паки работают. Это не проверка внешнего provider, доставки Push или физической слышимости. Stable Pages/R2, SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Материалы](../../../tmp_files/ux-021/fixed-overlays-1104/): source-state.json, final-manifest.json, own-changes.patch, guide-chromium.log, guide-webkit.log, chromium/webkit/scroll-cue-directions.json, tooltips-player-target.log, card-choice-guide.log, public-check.json, funnel-before/after.txt, live-pwa/chromium-report.json.

## Продолжение общей приёмки

Нельзя считать эту правку закрытием исходных жалоб на все обрезанные рамки: clipping/focus и расположение рамки — другая граница, уже имеющая отдельные изменения/evidence. Полная матрица A01–A36, физические устройства/AT/usability, реальные сети и роли, default-варианты обучения, оставшиеся игровые механики и производительность требуют своего подтверждения. Внешний полный recipe/dirty signals и немигрированные регионы не объявляются исправленными этим helper. Будущий SDK остаётся отдельным следующим релизом.
