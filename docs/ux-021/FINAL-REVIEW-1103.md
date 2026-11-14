# Независимая ревизия и исправления 3 ноября

Работа продолжается по полному GOAL A01–A36. Это адресная ревизия текущей итерации, а не объявление общей приёмки завершённой. Последние указания владельца обновлены в GOAL и COMPONENT-STANDARDS; исторические снимки не переписываются.

## Проверенные дефекты

- CloudSaves: старый ответ list мог отменить уже подтверждённое выключение автосохранения; запоздалый PUT также мог восстановить старую настройку. Исправлены владельцы metadata и повторная проверка автоматической отправки непосредственно перед записью. Добавлен account guard перед outer accept, чтобы ответ прежнего аккаунта не попадал в новый. Unit20/20 и browser3/3 в каждом из Chromium/WebKit. Реальные аккаунты и production SQL не затронуты. [Точные последовательности и границы](../../../tmp_files/ux-021/final-review-1103/backend-fix/edge-report.md).
- Chat composer: нативный Undo ломался при замене editable DOM на input; обработчик shortcode переведён на cancelable beforeinput. IME overflow не обрезается молча, некорректный draft сохраняется с локальной ошибкой и не отправляется. После свайпа свежий tap больше не поглощается общей задержкой. Четыре адресных browser-сценария в каждом движке; физическая OS IME отдельно. [Отчёт](../../../tmp_files/ux-021/final-review-1103/frontend-fix/report.md).
- Рамки правил и лобби резал scrollport с нулевым внутренним отступом, а не соседний слой. Общий clearance6px сохраняет прежние координаты и размеры контролов, включая font16→32. Два существующих browser-сценария в каждом движке,16 состояний/движок. [Измерения](../../../tmp_files/ux-021/final-review-1103/focus-fix/report.md).
- Локальное лобби больше не показывает неиспользуемое «не готов»; сетевые ready/connection состояния сохранены. В гостевом профиле доступна явная подпись «Войти в облако». Заголовок правил использует canonical modalHead с Назад последним. Существующий адресный lobby-файл: Chromium5/5, WebKit5/5.

## Независимые роли

Исходные отчёты: [backend](../../../tmp_files/ux-021/final-review-1103/backend.md), [frontend](../../../tmp_files/ux-021/final-review-1103/frontend.md), [design](../../../tmp_files/ux-021/final-review-1103/design.md), [UX](../../../tmp_files/ux-021/final-review-1103/ux.md). Отчёты привязаны к своему срезу; исправления и поздние указания имеют отдельное evidence.

UX-05 дополнительно проверен на настоящем маршруте DM → профиль друга → Назад: видимая подложка разговора, сохранённые DOM/editor/list/frame, draft, selection и scroll310 в обоих движках. Safe provider fixture, внешних запросов0. [Scope](../../../tmp_files/ux-021/final-review-1103/ux-underlay/report.md). Это не доказательство всех маршрутов A19 или физической usability.

## Последние требования

У каталога убрана строка «Все / Любимые», избранные игры остаются первыми; Filters — иконка рядом с видами. В списке описание переносится полностью, звезда ближе к углу. Узкий landscape должен сохранять размер обложки без дополнительного обрезания описания.

На touch скрывается только декоративная обводка фокуса интерфейсных контролов. Ввод, текстовый курсор, ошибки и выбранные состояния сохраняются. Мышь и навигация клавиатурой возвращают обводку, включая гибридные устройства. Игровые карты, фишки, доступные ходы и их выделение сохраняют собственную реализацию.

Каталог проверен адресно в Chromium/WebKit: полные описания списка и toolbar1/1 на движок, density1/1 в desktop Chromium и mobile WebKit; boundary600/700/701 и container326/327. Порог размера арта не ослаблен, текст и две строки square2 сохранены. [Отчёт каталога](../../../tmp_files/ux-021/final-review-1103/catalog-fix/REPORT.md).

Input modality: существующий settings case1/1 в каждом движке, tooltip keyboard/ARIA1/1 и touch-hold1/1 в каждом движке. Реальные input/search/custom-select не теряют значение, selection или focus; virtual typing/Enter не включают кольцо. Mouse/Tab возвращают его. Реальная selected UNO card и semantic first-player outline сохраняются; обычный game-menu control после touch не имеет декоративной обводки. Это шесть адресных запусков, не физическая OS keyboard приёмка. [Отчёт](../../../tmp_files/ux-021/final-review-1103/input-modality/report.md).

## Собранный кандидат и публикация

Один итоговый кандидат `tmp_files/ux-021/final-review-1103/final`, app0.21.0-preview.1/collection0.8.9-preview.3,15игр. Standalone SHA256 `883dd1240a535ace3dc8e525c82787d16244182d7f0ccc892418d9b1c268b8b0`; cache `playroom-pwa-v0.21.0-preview.1-dbef4de366a3d294`. Build exit0;8SHA/3ZIP CRC;230runtime,2canonical locale JSON, source worker и manifest сверены с source ZIP.20runtime-файлов изменились относительно counter-wording; worker/client update protocol не менялся, прежний отдельный PWA-upgrade proof не объявляется повторённым. PWA227файлов/6092784байта, +9208байт; уменьшение общего размера не заявляется.

Exact assembled HTML с обычными анимациями: Chromium70 и WebKit70 состояний, failures/errors/nativeSupabaseRequests/changedDuringRun0. Root дополнительно просмотрел Chromium list390 и WebKit rules editor390. Временные Funnel443/8443 и /hod-021.html обновлены без перезапуска подключения. Четыре публичные побайтовые проверки совпали; полный standalone подтверждён90HTTP206частями64КиБ по обычному DNS. Первый путь через explicit relay с512КиБ дал curl28 и сохранён как неуспешный; не считается PASS и не доказывает причину сетевой задержки. Никаких изменений VPN/proxy не делалось. Live Chromium по обычному URL подтвердил active worker, точный cache/buildIdentity, downloadProtocol1,15игр,PushManager; errors/nativeSupabaseRequests0.

Полные артефакты и точные результаты: `tmp_files/ux-021/final-review-1103/{final-manifest.json,source-state.json,artifact,public-check.json,live-pwa}`. Публичный адрес: https://seth.tail6aebd4.ts.net/. На ранее установленной PWA нужен штатный явный apply обнаруженного обновления; fresh-context live proof не выдаётся за физическое обновление телефона.

Общий GOAL A01–A36 остаётся активным. Физические устройства, assistive technology, независимая человеческая usability, внешние сети и доставка Push — самостоятельные ворота общей цели. Штатный релиз, production SQL, реальные сообщения и update announcement не выполнялись.
