# Подсказка прокрутки к цели — 4 ноября 2026

Статус: исправлено, проверено и опубликовано во временном превью. Общая GOAL 0.21 остаётся открытой.

## Исправленное поведение

Если ближайшая неосвоенная цель находится за краем прокручиваемого поля, общий FirstTurnGuide показывает направление ручной прокрутки и исходный текст действия. Он больше не перескакивает к видимому, но постороннему шагу вроде добора. Сначала выбирается видимая цель того же шага; если её нет, ищется действительно доступная прокрутка через clipping/scroll ancestors. При отсутствии пользовательского scroll range старое правило выбора видимой альтернативы сохраняется.

Добавлены четыре локализованные фразы. Вместо анимированного нажатия показывается общий arrow icon у видимого края scrollport. Подсказка остаётся pointer-events:none; не вызывает scroll, selection, command или mastery. После ручной прокрутки возвращается обычный указатель на цель. Режимы hidden/inert/busy/replay и текущие ограничения обучения сохранены.

В проверке координат выявлено отдельное смещение: `scrollbar-gutter:stable both-edges` задаёт сдвинутое начало fixed-слоя. Указатель теперь измеряет начало того же fixed-контекста скрытым нулевым probe; фиксированной поправки10px нет. Это исправляет и обычное позиционирование указателя. Другие tooltip/popover-компоненты этой правкой не объявляются проверенными.

Изменены app/first-turn-guide.js/css и canonical locales/ru/ui-app.json; core/messages.js сгенерирован сборкой. Правила, паки, API-версии и companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da` прежние.

## Проверки

- До исправления новый адресный case не находит scroll cue на прежнем b3f3c8 HTML: RED.
- `first-turn guidance explains clipped scroll targets without moving the field or learning the action`: Chromium1/1PASS и WebKit1/1PASS; в каждом случае right/left/up/down + RTL left/right. Cue вписывается в фактический scrollport, scroll offsets не меняются автоматически, прокрутка не засчитывает действие. После wheel-жеста указатель совмещается с центром цели с допуском1px; clipping overflow:hidden не предлагает невозможную прокрутку.
- `solitaire learning masters every goal through real input and validated saved positions`: Chromium1/1PASS и WebKit1/1PASS. В реальном Spider проверен новый cue до wheel, отсутствие автоматического scroll/хода/mastery, возврат к инструкции переноса; затем пройдены все13целей Spider/Klondike и reload persistence. Как прежде, это seed17/undo:history/manual-flip fixture scope, не все default-варианты.
- `screen:phone native horizontal scrolling reveals a guided target without dragging or committing`: Chromium1/1PASS. Actual CDP touch-pan на390×844 по пустой области реального игрового поля: scrollLeft0→180, move0→0, stock50→50, drag ghosts0. Затем настоящий touchscreen tap по открывшейся цели даёт ровно move1 и target mastery1. Это браузерная эмуляция native touch, не физический телефон.
- Все проверки без page errors и native Supabase requests. HTML response SHA: `8391cdfac708d5476c583425b8a983149530a61fad99564683e64464f5e6ba53`. Просмотрен screenshot Spider с новой подсказкой.

Промежуточные отказы не засчитаны в PASS: ожидание visibility нулевого overlay заменено ожиданием видимой caption; измерение по реальному scrollport выявило настоящий fixed-origin дефект. Строгие проверки попадания стрелки в границы сохранены, а не удалены.

## Сборка и публикация

Build8SHA256/3ZIP CRC;246runtime/locale/test файлов source ZIP совпали. Из230runtime-файлов изменены3 (JS,CSS,generated messages),227прежние. Canonical locale и тесты записаны в freeze; pack source hashes/installed companion прежние.

Разрешённые Funnel443/8443/standalone routes переключены на final этой итерации. Stable Pages/R2/SQL и другие службы не менялись. Четыре публичные загрузки совпали побайтно; полный standalone проверен64KiB ranges с Content-Range/length. Live Chromium: worker activated/cache/buildIdentity `playroom-pwa-v0.21.0-preview.1-c6b4c9a9fffe531a`,15игр,downloadProtocol1,errors0,nativeSupabaseRequests0,sourceDrift0. Ready/offline6снимков390×844/844×390 без overflow. Offline reload/coldPage/Domino/save/profile PASS. `/api/packs/catalog`404 остаётся известным ограничением static Funnel, встроенные паки доступны.

URL: https://seth.tail6aebd4.ts.net/ ; также8443 и /hod-021.html.

[Материалы](../../../tmp_files/ux-021/guide-scroll-1104/): red.log,chromium.log,webkit.log,mechanism-webkit.json,learning-*.log,all-goals-*.json,*/scroll-cue-directions.json,spider-scroll-cue.png,native-scroll.log,native-scroll/native-guided-scroll.json,source-state.json,own-changes.patch,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json.

## Осталось

Физический touch, AT/независимая usability, default-настройки обучения и все игровые состояния не приняты. Общий fixed-coordinate аудит других поверхностей, остальные игры/роли/сети/OS Push, внешние recipes/dirty signals и остаточная производительность остаются открытыми. Этот адресный результат не завершает ни всю0.21, ни будущий SDK.
