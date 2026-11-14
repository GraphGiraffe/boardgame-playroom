# Актуальная приёмка · 11 ноября 2026 · preview.70 / collection.42

Текущее состояние всех A01–A36, последние решения владельца и происхождение доказательств — в [CURRENT-IMPLEMENTATION-1111.md](CURRENT-IMPLEMENTATION-1111.md). Статусы карточек и незавершённая живая приёмка — в [аудите релиза](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/dev/docs/project/app/RELEASE-WORK-AUDIT-1111.md).

Записи «Текущее превью» ниже — **датированная история отдельных этапов**, а не текущая версия приложения. Они не отменяют последующие исправления и указания владельца. Исторические evidence и ограничения сохранены.

## Текущее превью · 0.21.0-preview.2 · 04.11

[Обновления, лобби, чат, Косынка, Паук и производительность Стихийной потасовки](UPDATE-FLOW-AND-MAGE-1104.md). PWA/Funnel опубликовано; выбранные сценарии Chromium/WebKit, публичные файлы 4/4, офлайн 6 состояний. HTML `23607f703110cb2f`, cache `8b876908d7b063f6`. Проверка физического телефона и полная приёмка цели остаются открытыми.

## Текущее превью · индексы и безопасные зоны карт · 04.11

[Отчёт](CARD-PRINT-LAYER-1104.md): номиналы над рамкой, классический левый отступ как у альтернативного, сжатая «10» с прежним шрифтом, корректное перекрытие пасьянсов. Штатный UI36×2engine, образцы312×2, перекрытие24×2; public4/4, PWA/offline6состояний, sourceDrift0. HTML `5918a3244ca6a30d`, cache `8c77e8a829747f8c`; evidence `tmp_files/ux-021/card-print-layer-1104/final-manifest.json`. Физический телефон и вся цель0.21 ещё требуют приёмки.

## Текущее превью · меню, сохранения, результаты и звук · 04.11

[Отчёт с замерами и ограничениями](USER-MENU-SAVE-1104.md): устранено повторное восстановление истории при проверках меню, компактные portable/cloud saves, возврат истории к результатам, ранняя разблокировка и сигналы звука меню. HTML `5e063b3c17763620`, cache `c0042e90de1454f5`; public4/4, PWA/offline6состояний, sourceDrift0. Evidence: `tmp_files/ux-021/user-menu-save-1104/final-manifest.json`. Физический телефон и вся цель0.21 ещё требуют приёмки.

## Текущее превью · диагностика партии · 04.11

Доступна включаемая диагностика с выгрузкой JSON и portable-save. [Как пользоваться и что проверено](DIAGNOSTICS-1104.md). Evidence: `tmp_files/ux-021/diagnostics-1104/final-manifest.json`; HTML SHA256 `3cf4da453bb3a86b3fc5580053a4ea4571788be19dae3d25ef2916a27dbf5171`. Public4/4, PWA/offline6состояний, sourceDrift0. Общая цель0.21 остаётся открытой; причина задержек физического телефона не объявлена устранённой.

# Текущее превью: короткие заголовки выбора параметров

[RULE-CHOICE-HEADINGS-1104.md](RULE-CHOICE-HEADINGS-1104.md): HTML `a6501bb6649a`, cache `a5d6fbd95771ebd1`. Скрытая справка больше не включается в заголовок/aria-label общего dropdown. Select current/focus/keyboard/resize1/1×2engine, три настоящих Ludo fields в exactHTML1/1×2.8SHA/3ZIP/source254/public4/livePWA-offline PASS. Все15паков, предыдущие исправления рассадки/описаний сохранены. Полная GOAL открыта.

## История

# Текущее превью: описания квадратных карточек в две строки

[CATALOG-DESCRIPTION-1104.md](CATALOG-DESCRIPTION-1104.md): HTML `7a71b00c3372`, cache `2e174f90aee7b8a9`. Общий шрифт описания10.5px, мягче цвет, квадратная карточка не более2строк. Полное описание Mage Brawl помещается на360/390/430px. Reflow existing case1/1×2engine, default/увеличенный текст и3вида;8SHA/3ZIP/source253/public4/livePWA-offline PASS. Все15паков и исправления двухрядной рассадки сохранены. Полная GOAL остаётся открытой.

## История

# Итоговое превью: две строки участников и завершённые исправления Дурака

[Полный отчёт4ноября](FULL-REPORT-1104.md): HTML `b243fb2b429d`, cache `6ab5011bc386afc0`. Возвращён portrait roster максимум в2строки; доступен весь стол Дурака, исправлено clipping через ограниченный scrollport. Регионы карт/козыря/рубашки сохраняют незатронутые узлы и SVG. ExactHTML drag8/8×2engine;6пар/2строки/scroll7viewport×2; shared geometry179/179×2; pointwise/privacy1/1×2; views30/30 для неизменённых source inputs. Build8SHA/3ZIP/source252/public4/livePWA-offline6states PASS. Коллекция0.8.9-preview.12,15игр. Полная GOAL/все15game-flows/внешний recipe/latency/physical/AT/audio/usability не объявлены завершёнными.

## История

# Текущее проверенное превью: карты и общие зоны Go Fish/Old Maid

[HAND-GAMES-REGIONS-1104.md](HAND-GAMES-REGIONS-1104.md): HTML `46ace42423e6`, cache `ff41168643e42355`. Регионы собственных/публичных карт, stock/books/discard; скрытые личности не кэшируются. Views29/29, exactHTML learning/реальные действия/hand+SVG retention по2case×2engine; WebKit Mage undo case повторён с ожиданием подтверждённой отмены. Runtime230 прежний, другие13паков идентичны. Build8SHA/3ZIP/source252/public4/livePWA-offline6states PASS. Полная GOAL, скрытые рубашки/внешний recipe/latency и physical/AT/audio/usability открыты.

## История

# Текущее проверенное превью: Пексесо сохраняет клетки и SVG

[PEXESO-REGIONS-1104.md](PEXESO-REGIONS-1104.md): HTML `381e85b62c3e`, cache `80ffaca7363e1300`. Регионы публичных позиций и explicit physical DOM keys сохраняют клетки через промежуточные сцены; disabled button сохраняет SVG при блокировке. Views28/28; source flip/mismatch обе колоды×2engine; exactHTML cartoon/52×3размера×2engine с реальным tap/flip PASS. Build8SHA/3ZIP/source252/public4; live/offline6states PASS после отдельного сертификатного сбоя Chromium, причина не установлена. Полная GOAL, прочие сцены/общий recipe/latency и physical/AT/audio/usability открыты.

## История

# Текущее проверенное превью: регионы Ятзи и сохранение прокрутки

[YATZY-REGIONS-1104.md](YATZY-REGIONS-1104.md): HTML `47e51c83eefb`, cache `1b6c278a04188684`. Кубики и строки счёта обновляются отдельно; общий Стол сохраняет узлы при переходе live/inert. Общий GameScreen сохраняет scrollports при частичных patch, исправлен воспроизведённый сброс WebKit на reroll. Views27/27; source score/roll по1/1×2engine, generic fragment/geometry guards×2; exactHTML roll/hold/reroll по1/1×2. Build8SHA/3ZIP/source252/public4/livePWA-offline6states PASS. Полная GOAL, внешние recipe/прочие сцены/latency и physical/AT/audio/usability остаются открытыми.

## История

# Текущее проверенное превью: Domino сохраняет компоненты

[DOMINO-REGIONS-1104.md](DOMINO-REGIONS-1104.md): HTML `fa1e3dced43c`, cache `de5bac46521b2435`. Региональные рисунки и физические DOM-ключи сохраняют неизменённые кости при выборе и вставке в цепочку; legal controls обновляются отдельно. Drag Chromium11/WebKit7 PASS; layout Chromium12/WebKit10 PASS, native touch только Chromium. Build8SHA/3ZIP, public4/4 и live PWA/offline6состояний PASS. Полная GOAL, общий пересчёт/latency, physical/AT/audio/usability остаются открытыми.

## История

# Текущее проверенное превью: сохранение root Общения

[COMMUNITY-RETAINED-HOST-1104.md](COMMUNITY-RETAINED-HOST-1104.md): HTML `a7eb2bba4184`, cache `44581c31451e4cc8`. Исправлен пустой раздел после Общение→Мои партии→Общение; explicit DOM ownership сохраняет managed input/list/focus/selection/scroll при Hub repaint, account/retired-action privacy проверены. Повторный keyboard input state2→0 DOM writes, destroy/attach сохранены. Actual HTML keyboard1/1×2engine; source ownership1/1×2 и tooltips3/3×2 PASS. Build8SHA/3ZIP/source250/public4/livePWA-offline PASS;15паков прежние. Полная GOAL, общий render/latency и physical/AT/usability открыты. Предыдущая [CSS-оптимизация](ACTION-STYLE-INVALIDATION-1104.md) включена.

Дополнительная source-приёмка04.11: [COMMUNITY-COVERAGE-1104.md](COMMUNITY-COVERAGE-1104.md) — оставшиеся четыре именованных Community cases по1/1 на Chromium/WebKit: быстрые действия, группы, уведомления/motion, поиск друзей/retired responses. Уведомления повторены после актуализации только старого селектора «Доступность»→«Эффекты»; прочие успешные случаи не повторялись. Runtime/превью прежние; real server/device/audio/usability gates открыты.

Дополнительная source-приёмка04.11: [CHAT-FLOWS-COVERAGE-1104.md](CHAT-FLOWS-COVERAGE-1104.md) — четыре цепочки A21–A24 по1/1 Chromium/WebKit: RTC overlay/сцена, полный поиск/BigInt, replies/reactions/draft, background invitation/membership epochs. Два старых глобальных селектора учитывали disposed visual exits; тесты теперь проверяют исходный frame и active/modal-root, прежние privacy/cache/cursor guards сохранены. Превью/runtime прежние; real network/device/AT/audio/usability gates открыты.

Диагностика04.11: [MOTION-READ-EXPERIMENT-1104.md](MOTION-READ-EXPERIMENT-1104.md). Локальный capture-кэш сократил чтения общего предка7→1, функциональные проверки прошли, но controlled LongTask72→75мс не подтвердил ускорение. Вариант не опубликован; motion/test восстановлены точно, source drift0. Runtime/превью прежние; остаточная задержка и full-scene dependency работа открыты.

## История

# Текущее превью: постоянная физическая идентичность регионов

[FRAGMENT-IDENTITY-1104.md](FRAGMENT-IDENTITY-1104.md): опубликован HTML `886c270c277e`, cache `4da0395728977d06`. Общий DOM key учитывает region ID: при смене span/button не заимствуются узлы/обработчики соседних клеток. Механизм по1/1 Chromium/WebKit; actualCheckers12/12 и5/12+7skip; Spider/Klondike skins1/1 PASS. Build8SHA/3ZIP/source248; public4/4; live/offlineDomino/save/profile PASS. Renderer Лудо ещё не мигрирован; полная GOAL/latency/physical/AT/usability открыты.

## История

# Текущее превью: регионы клеток шашек

[CHECKERS-REGIONS-1104.md](CHECKERS-REGIONS-1104.md): опубликован HTML `95dfa8d5c81e`, cache `338afd4cffef8138`; Checkers0.5.5-preview.4, collection0.8.9-preview.5. Повторный показ доски строит0SVG вместо24, выбранные/изменённые клетки обновляются отдельно при точном HTML/input parity. Views23/23; actualdrag Chromium12/12,WebKit5/12+7CDPskip. Остальные14паков идентичны. Build8SHA/3ZIP/source248; public4/4; live/offlineDomino/save/profile PASS. Внешний recipe/прочие сцены/latency/physical/AT/usability и полная GOAL открыты.

## История

# Текущее превью: выбор виден после поворота открытого picker

[SELECTION-RESIZE-1104.md](SELECTION-RESIZE-1104.md): опубликован HTML `64489b394159`, cache `b7ce82c9033703ea`. Общая подписка scrollport сохраняет видимый текущий focus при resize, но не отменяет ручную прокрутку к другим вариантам. Dropdown/аватары по1/1 Chromium/WebKit: rotations/узкий viewport/root font24→16 PASS; draft/focus/owner lifetime сохранены. Build8SHA/3ZIP/source248; public4/4; live/offlineDomino/save/profile PASS. Полная GOAL и прочие состояния/physical/AT/usability остаются открытыми.

## История

# Текущее превью: видимый текущий аватар и общий scrollport выбора

[AVATAR-REVEAL-1104.md](AVATAR-REVEAL-1104.md): опубликован HTML `751b116c2ee7`, cache `3c8f675294aeff91`. Dropdown и аватары используют общую вертикальную прокрутку внутри собственного scrollport и inset6px; поздний текущий аватар виден при открытии. Avatar caller и45option dropdown по1/1 Chromium/WebKit PASS; draft/focus/owner lifetime сохранены. Build8SHA/3ZIP/source248; public4/4; live/offlineDomino/save/profile PASS. Полная GOAL и прочие состояния/physical/AT/usability остаются открытыми.

## История

# Текущее превью: текущий пункт dropdown виден и получает фокус

[SELECT-FOCUS-1104.md](SELECT-FOCUS-1104.md): опубликован HTML `8de233c5f505`, cache `940cbdbabb904fa9`. Исправлен выбор первого пункта вместо текущего; общий picker прокручивает только свой список. Case45вариантов и настоящее Оформление по1/1 Chromium/WebKit PASS, focus/draft/scroll/scene сохранены. Build8SHA/3ZIP/source247; public4/4; live/offlineDomino/save/profile PASS. Полная GOAL, все рамки/состояния, physical/AT/usability и производительность остаются открытыми.

## История

# Текущее превью: регионы без повторного разбора каркаса

[STABLE-SKELETON-1104.md](STABLE-SKELETON-1104.md): опубликован HTML `47c80bcc1a4b`, cache `620266048c7ea11d`. При неизменном outer markup обновляются только изменившиеся чистые регионы; skeleton parse3→1 в адресном случае. DOM/input сохранены в Chromium/WebKit, default learning/skins/native touch и обычный audience path PASS. Build8SHA/3ZIP/source247; public4/4; live/offlineDomino/save/profile PASS. Внешний recipe, иные сцены, общая задержка, physical/AT/usability и полная GOAL открыты.

Адресное дополнение04.11: [передача хоста в работающей Ludo через настоящий RTC](RTC-PLAYING-TRANSFER-1104.md) — Chromium1/1 и WebKit1/1 на текущем47c80b HTML: отказ/согласие, concurrent activation→1authority, seats/session/control-state сохранены, old-host close, чат и revision0→1. Runtime/превью неизменны. Это локальные3контекста, не внешние сети/physical/все игры и не весь GOAL.

## История

# Текущее превью: общие координаты подсказок и меню

[FIXED-OVERLAYS-1104.md](FIXED-OVERLAYS-1104.md): опубликован HTML `dfb95f61cdcc`, cache `5fa2ea70cc1631f0`. Общий fixed-coordinate helper устраняет повторный root-gutter offset в tooltip, меню игроков и обучении. Новый geometry-case Chromium/WebKit по1/1; tooltip/player-target6/6 Chromium; guide6направлений×2engine PASS. Build8SHA/3ZIP/source247, public4/4, live/offlineDomino/save/profile PASS. Полная GOAL, физические устройства/AT/usability, все рамки и остаточная производительность остаются открытыми.

Адресное дополнение04.11: [стандартные правила пасьянсов и обучение](DEFAULT-SOLITAIRE-LEARNING-1104.md) — default undo:last/autoFlip:auto/draw3 проверены Chromium1/1 + WebKit1/1 на текущем dfb95f HTML. Spider5/5; Klondike7/8 без ложного mastery ручного flip и без зависшей подсказки. Ручной вариант13/13 повторно PASS в Chromium. Runtime/превью неизменны; полный матч, другие варианты, physical/AT/usability и общая GOAL открыты.

## История

Адресное исправление04.11: [scroll cue](GUIDE-SCROLL-1104.md) — published8391cdf; направление к скрытой цели вместо постороннего шага; точная fixed-привязка. Chrome/WebKit и native touch-pan PASS; physical/usability/default-варианты остаются открытыми.

Адресное дополнение 04.11: [обучение обоих пасьянсов](SOLITAIRE-LEARNING-1104.md) — все 13 отдельных целей пройдены через реальные UI-команды/валидированные позиции, 1/1 Chromium + 1/1 WebKit, прогресс и чек-листы сохранены после reload. Варианты undo:history/manual flip названы явно; default-настройки, физические устройства и offscreen-target usability не закрыты. Runtime/превью b3f3c8 неизменны.

Адресное дополнение04.11: [fragment parser](FRAGMENT-PARSER-1104.md) — publishedb3f3c8; неизменённые колонки не парсятся/клонируются. Draft/caret/nonzero scroll/WAAPI проверены×2engine; dirty signals/внешнийrecipe/остальнаяматрица открыты.

Адресное дополнение04.11: [регионы колонок](SCENE-REGIONS-1104.md) — publishedc7bcd6; оба пасьянса сохраняют скин после новыхкоманд, Chrome/WebKit PASS. Offline оболочка/Domino/save/profile PASS. ПолныйHTML-парсинг/ненулевойscroll/остальная матрица открыты.

Адресное дополнение04.11: [pack activation](PACK-ACTIVATION-1104.md) — повторная регистрация неизменённого пака устранена; опубликовано8b9cad. Точечный renderer/полная приёмка остаются открытыми.

Адресное дополнение04.11: [card-choice backdrop](CARD-CHOICE-BACKDROP-1104.md) — общий dialog закрывается native touch/mouse без выбора/click-through; опубликовано `04086ea4d13b`. Полная матрица остаётся открытой.

Адресное дополнение04.11: [compiler baseline](COMPILER-BASELINE-1104.md) — model-contract21/21PASS; runtimebe443f не менялся. Это закрывает прежний authoring gate, не полную UI/game приёмку.

Актуальное дополнение04.11: [deferred stock artwork](DEFERRED-STOCK-1104.md), previewbe443f/cacheaa9980. Устранена конкретная лишняя копия; полная authored-разметка и~100мс не закрыты.

Адресное дополнение04.11: [трёхсторонний RTC handoff лобби](RTC-LOBBY-TRANSFER-1104.md) расширяет A05/A08/A13. Устройства/внешние сети/другие роли и автостарт остаются отдельно. Runtime d35652 неизменён.

Адресное дополнение04.11: [native UI audio routes](UI-AUDIO-ROUTES-1104.md). Connection/foreground handoff classifier→WebAudio проверен; реальные Push/RTC/physical ворота остаются открыты.

Адресное дополнение04.11: [Mage loot/effects/playback](MAGE-EFFECTS-1104.md),3cases×2engine на текущем d35652. Runtime/preview не менялись; прочие границы сохраняются.

Актуальное дополнение04.11: [повторные копии immutable-позиций](SNAPSHOT-COPIES-1104.md), preview d35652/cache0d9146. Остаточная задержка и вся цель не закрыты.

Актуальное дополнение04.11: [ввод, пасьянсы и контекст меню](INPUT-AND-SOLO-LAYOUT-1104.md), preview764ea7/cache d0af3c. Проверенный scope ограничен перечисленными случаями; общий GOALwork.

Актуальное дополнение04.11: [звук, обучение, продолжение партий и понятность подсказок](FUNCTIONAL-AUDIO-LEARNING-1104.md). Native incoming9сценариев/engine не закрывают physical/server delivery; selectedtutorial и Ludo/UNOcontinuation не означают полное15game покрытие. Currentpreview488/cache1a3d, GOALwork.

# Приёмочная карта ХОД 0.21

Карта составлена01.11; актуализирована03.11.2026. Покрывает все 36 тем `owner-decisions-7.json` и связный прототип.
Поздние указания владельца имеют приоритет над условным HTML: На устройстве /
Онлайн / Рядом; чтение правил отдельно от настроек; старые палитра/иконки/игровые
renderers; крупные/компактные квадратные карточки с обычной плотностью2/3 и reflow при крупном тексте; меню преимущественно текстом. Ни один PNG
не доказывает сквозной сценарий. Это карта приёмки всего scope, не отчёт «всё готово».

Источники: `ASSEMBLY-DECISIONS.md`, `DECISIONS-REVIEW-3.md`,
`CONNECTED-PROTOTYPE.md`, `UX-REVIEW-NEXT.md`; workspace
`tmp_files/ux-021/connected-prototype/{prototype.js,owner-decisions-7.json}`.

## Легенда и правило завершения

- **Частично** — есть реализация/адресные свидетельства, но не все состояния строки.
- **Проверить** — карта составлена; свежая сквозная приёмка этой темы не выполнена.
- **Разрыв** — известное отсутствующее/старое решение; нельзя закрывать одним CSS.
- Доказательство записывать как viewport + engine + persona + точная команда или
  артефакт + результат. Старый PASS применим только к неизменившемуся поведению.
- После изменения runtime повторять затронутый путь; не запускать все тесты из-за
  этой карты. Онлайн/две стороны, physical push и реальные iPhone — отдельный scope.

## Текущий срез доказательств, 3 ноября

[LOCAL-CANDIDATE.md](LOCAL-CANDIDATE.md) определяет текущую сборку; [RULES-REFLOW-AND-TYPE-1103.md](RULES-REFLOW-AND-TYPE-1103.md) — исторический адресный source/artifact/live scope. ACCOUNT-BACK-AND-OUTSIDE-1103.md остаётся адресным историческим свидетельством возврата, а не указателем текущего build. Ни одна строка ниже не является общей physical/usability-приёмкой. Исторический журнал внизу сохраняет прежние ограничения на дату его записи; новые адресные результаты переопределяют их только в указанном scope. A05 и A08 сохраняют частичный статус до покрытия недоказанных ролей и недопустимых конфигураций.

## Экраны, окна и состояния

| ID / решение 7 | Поверхность и вход | Обязательные состояния и критерий | Статус перед общей приёмкой |
|---|---|---|---|
| A01 Навигация | Игры / Мои партии / Общение / Параметры, root | Четыре подписанных назначения; текущий раздел очевиден; один root-заголовок; root не inert; Back закрывает overlay прежде ухода; root-scroll сохраняется | Текущий Back аккаунта: внутренний режим→обзор→исходные Параметры, exactframe сохранён;6selectedaccountPASS и20состояний exactHTML/engine, ACCOUNT-INNER-BACK-1103.md и ACCOUNT-BACK-AND-OUTSIDE-1103.md. Прочие навигационные роли подтверждаются предыдущими адресными отчётами, не этимcase. |
| A02 Каталог | Игры; фильтры — panel | Общий toolbar: виды, icon-only Фильтры и «В комнату» с естественным переносом при нехватке ширины; нет строки Все/Любимые; избранное первым. Крупные/компактные — плотности, при большом тексте столбцы перестраиваются. Полные названия/описания обычных карточек, compact без описания/механик; квадратность/арт/звезда/типы и capsule механик; порядок/скрытие/view persist; empty/no-matches различны | Последний reflow и навигация: RULES-REFLOW-AND-TYPE-1103.md,405cardstates/engine и12typography states/engine, actual Chrome font preference/WK controlled root. Актуальная owned filter panel draft/apply/reset/cancel/focus/root-return: Chromium4/4 и WebKit4/4, tmp_files/ux-021/catalog-filter-followup-1103/report.md. Physical/usability отдельно. |
| A03 Карточка игры | Короткая panel поверх каталога | Название/art/понятные действия; На устройстве → Онлайн → Рядом; правила здесь читаются; отмена возвращает scroll и фильтр каталога; вход в облако не создаёт комнату до согласованного действия | Новая короткая панель и сохранение выбора/Auth continuation; final Chrome/WebKit по1/1. A03/A06/A07 вместе52кадра/13состояний; независимая сверка19selectedframes без новыхP0/P1. fidelity/context-choices-021-evidence.md; остальные роли отдельно |
| A04 Мои партии | Root; Активные / История | Default Активные; completed не считаются активными; архив не архивирует чаты; компактная информативная карточка: тап/Enter открывает все действия, включая продолжение; свайп не нужен; continue/history/delete/import/export/cloud; missing pack и invalid записи с объяснением | Новый compact shared DOM≈84px, явные CTA/context/swipe, actual storage roles/history, Back-scroll fix; Chromium/WebKit по1/1. Final20PNG в saved-021-evidence.md; последняя независимая WK сверка отдельно  Последний компактный формат: typical host182.38→138.58px/local174.17→135.78px, все metadata сохранены; compact-saved по1/1 обоими. |
| A05 Лобби | Экран комнаты | На устройстве/Онлайн/Рядом; host/player/spectator/table; список людей/ботов/мест; нижнее первичное действие; подписанные правила/invite; autoStart default, не стартовать без допустимых условий; ready объяснён; запущенная игра и возврат в лобби | Частично: unifiedlobby5/5×2engine (4viewport+parent), self/hostbotdrag иfirsttoken черезавторитетныекоманды, RTC1/1×2engine. LOBBY-DRAG-1103.md. БотыLudo/UNO продолжают подобычнымUI: LUDO-MODAL-BOT-LIFECYCLE.md / UNO-MODAL-DEADLINE.md. Полный remote role/state/physicalпроход отдельно. |
| A06 Участник | Panel из строки человека/места | Имя/avatar/status/роль; Написать / Друг / Передать хоста / Исключить по правам; зритель и стол могут принять host; self/bot/offline имеют корректный состав; набор известен до показа, без прыжков | Подписанные контекстные строки, заранее определённые права/соединение/роли; actualRTC spectator/Table/playing/offline, fullwidth844. Final Chrome/WebKit по1/1 и metadata case1/1; selected designer review принята. fidelity/context-choices-021-evidence.md |
| A07 Боты и места | Свободный слот → panel; слот бота → editor | Свободный/закрытый/командный слот; Лёгкий/Средний/Сложный; добавить/изменить/удалить; отмена не мутирует; в проверочных комнатах средний бот сразу; ready/start обновляются после выбора | Собственные уровни сложности и общие панели; канонические номера мест, self/hostbotdrag иfirsttoken. LOBBY-DRAG-1103.md, PHONE-FOLLOWUP-1103.md. Старое обозначение native не описывает текущий picker. |
| A08 Правила партии | Собственная panel/editor из лобби | Компактные карточки параметров по группам Порядок игры / Параметры / Завершение; одна существенная mode-карточка; иллюстрация меняется при выборе, подпись закреплена над кнопками, Help у угла; inactive slot остаётся на месте; сохранение атомарно валидирует, Cancel не мутирует; ready сбрасывается по контракту | Частично: отдельный reader/editor и назначенный firstplayer проверены Unifiedlobby. Новая отмена draft и повторное открытие сравнивают полный RoomService snapshot на390px; выбранныйcase5/5Chrome+5/5WebKit. RULE-DRAFT-RETURN-1103.md. Новый единый rules/order commit: RULES-ATOMIC-SAVE-1103.md, invalidorder отказ безмутации и одна revision/event. Declared-choice validation неизвестного preset/UNO options, exact installed manifest и atomicsave: tmp_files/ux-021/a08-followup-1103/report.md; unit5/5, browser2/2×2. Локальные guest wire/actor player/spectator/Table, transfer freeze, starting/playing guards проверены; Ludo teams2 сохраняется и блокирует старт до4. Это не реальный RTC/двухустройственный прогон, не все semantic cross-field/version-upgrade состояния и не physical приёмка. Открытый editor при host handoff: actual HostTransferUI/Sender/lobbyBundle/promote/rollback с локальными consent/signaling/ACK портами, Chrome1/1 и WebKit1/1; disposed submit не меняет snapshot/defaults, новый host редактирует и возвращается. tmp_files/ux-021/a08-followup-1103/ownership/report.md. Это не RTC/два устройства. |
| A09 Приглашение | Только из лобби, отдельный экран/панель по размеру | Вкладки назначения + поиск + ссылка/system share; friend/group selection; feedback отправки/error/retry; нельзя отправить повтор двойным тапом; back к той же комнате | Реализация нового экрана; адресный invite case Chromium/WebKit по 1/1, показанные states приняты дизайнером. INVITE-IMPLEMENTATION.md; реальная рассылка отдельно |
| A10 Вход | Экран кода + preview | Код пустой/неполный/not-found/closed; preview game/room/доступность; Войти только после preview; уже активная комната → возврат, не disabled тупик; старое приглашение → компактно истекло | Find/preview/Join реализованы; Chromium/WebKit по 1/1, соседний account case 1/1; 10 групп проверок. Source-only RPC/SQL принят локально; production rollout отдельно. ENTRY-IMPLEMENTATION.md |
| A11 Подключение | Один статус с раскрываемыми подробностями | Проверяемые direct/STUN/TURN понятны; success галочка + метод → переход через 0.5 s; cancel прекращает поздний переход; timeout/retry/reconnect; не требовать разбираться в SDP | Единый presenter; ICE unit и controlled browser Chromium/WebKit 3/3; entry paused-child regression по 1/1. CONNECTION-IMPLEMENTATION.md; final визуальная сверка и physical отдельно |
| A12 Рядом | Мастер двух телефонов | Host/joiner шаги; QR / звук / код как альтернативы; понятно какой телефон делает следующий шаг; permission denied/no camera/no mic; repeated/stale answer безопасен; cancel выключает media | Новый мастер; selected по 10/10 Chromium/WebKit, настоящий локальный RTC по 13 этапов и делегированный третий клиент 14. NEARBY-IMPLEMENTATION.md; physical QR/audio/TURN отдельно |
| A13 Настройки комнаты | Короткая panel из лобби | Название/доступ/players invite + закрыть; роли; save/error/отмена; close предупреждает последствия, приглашения истекают; нет отдельного менеджера людей/дублирующего invite | Structuralcleanup завершён; Networkpermission теперьвA13передName,notificationчерезexistingemit; staleowner/phase/roomguards иtruthfulcopy. Sourceunit1/1,4UIcase×2engine,controlledroot×2иnormalbaseline,independent4PNG; exact457b28states/engine/public/livePASS. [A13 preview](A13-ROOM-ACCESS-PREVIEW-1103.md). Текущий UNO localRTC Chrome1/1+WebKit1/1 PASS после миграции stale testpath; [точный scope](POINTWISE-LEARNING-1103.md). Physical/realaccounts/realnetwork приёмкаещёоткрыта. |
| A14 Партия | Реальный pack renderer | Оба orientation: квадратная область поля, landscape оппоненты слева/игрок справа; tuned hands/animations сохраняются; действия внизу; особые действия выше overlay; поле не remount из-за чата/внешних модалок | Общая геометрия15паков/ориентации — INTEGRATION-2026-11-02.md; новые localhandtouch/cancel/blankselection — LOCAL-MOBILE-HAND-GESTURES.md; canonicalUNOwhiteborder — UNO-PRINT-BORDER.md. Ludo/UNOdeadline подUI доказаны отдельно. Физические жесты всехигр не объявляются проверенными. |
| A15 Меню партии | Короткая panel; landscape справа | Лобби / Правила / Настройки / Завершить с stop; временный бот доступен по роли/условиям; отмена сохраняет ход; не превращать общее settings в глобальное меню | Единый список безспойлера; обычное меню не останавливает ботов, explicitPause сохраняет смысл. PHONE-FOLLOWUP-1103.md, LUDO-MODAL-BOT-LIFECYCLE.md, UNO-MODAL-DEADLINE.md. Исторический summary не является текущимтребованием. |
| A16 Результаты | Итоговый экран | Победа/поражение/draw/team; реальные места/результат; История / В лобби / Ещё партию; completed→История, badge decrement; возврат не зависает на countdown0 и не теряет роль нового host | Actual local pipeline: draw TicTacToe, defeat с scheduled bot и team victory Ludo612; Chrome1/1+WK1/1, по3journeys, History/rematch/lobby без countdown0. LIVE-COMPLETION-ACCEPTANCE.md. Common multiplayer completion после handoff/back+scheduledbot, spectator/table, Chrome2/2+WK2/2; HANDOFF-COMPLETION-ACCEPTANCE.md. Другие game-specific terminal и physical отдельно |
| A17 Передача хоста | Сначала верхний banner → panel по tap | Добровольно в lobby и playing; offer не блокирует ход; recipient accept/reject/timeout/error; sender получает верхний outcome; корона со стрелкой; spectator/table; без аварийной передачи; overlay не двигает сцену | Новый пассивныйbanner→общийregistry panel; exactchat/focus/selection/cancelchildren/actualRTClobby по1/1 Chrome/WebKit, live spectator/Table+обратно по2/2, protocolunit1/1. HOST-OFFER-IMPLEMENTATION.md; свежая независимая visual/physical отдельно |
| A18 Общение | Root Чаты / Друзья | Подписи видны; guest CTA; new conversation/groups/friendrequests; unread/badges; вкладка/scroll сохранены; свайпы Прочитано✓/Поиграть + ⋯ альтернатива; чаты не архивировать | Owned Community + alwaysmounted opaque root/deactivation, quiet controls и actual nativeinput/draft/selection при возвратах;4affectedChrome4/4+WK4/4, full longsocial по1/1. COMMUNITY-OWNERSHIP.md + LONG-SOCIAL-MIGRATION.md; новая root mixed66/18 отдельна |
| A19 Друг | Поиск/заявки; профиль — panel | empty/query/loading/no-result/error; входящая/исходящая заявка/accepted/removed; Добавить/Удалить/Написать/Поиграть названы; уведомление о добавлении; отмена не удаляет | Ownedsearch+одинRetryprimary/inlinefeedback, states/account/heldguards; finalвaffectedcommunityfile Chrome5/5+WK5/5. FRIEND-SEARCH-IMPLEMENTATION.md; независимое замечание duplicateRetry закрыто, fullrelationships/physical отдельно |
| A20 Группа | Одна форма + профиль/участники | Создать с name + выбором людей; no-members validation; info/edit/history access/leave/remove по правам; Back удерживает контекст; invite в игру отправляется из лобби | Новая форма/create/info/invite; выбранный A20 case Chromium/WebKit по 1/1 + neighboring quick-actions 1/1. 12 свежих PNG, показанные states приняты; реальные приглашения и все роли отдельно |
| A21 Чат в партии | Portrait снизу; landscape справа; overlay | Launcher снизу слева portrait, у правого края снизу landscape; icon+малый chevron, без Чат; край плоский; tap/pull; hides when open; resize; scroll истории отдельно от dismiss; local/team/full channels | Общий gamechat и ownedстек: явное действие/уведомление за nonmodalчатом открывает child и сохраняет exactDOM/draft/selection; blankoutside закрывает, pan/drag не закрывают. ActualRTCcaseChrome/WK1/1, GESTURE-TEST-MAINTENANCE.md. Физическая клавиатура отдельно. |
| A22 Полный разговор | Экран разговора, поиск из меню личности | Имя/status/group; длинная история/search/no-result; unread divider + jump; новые входящие не срывают scroll при чтении старого; composer draft per identity; back к тому же списку | Owned DM instances/push/Back/BFCache ports, unboxed history и весь permitted serversearch. A22 retained-search/target/hidden403 Chrome1/1+WK1/1; A23, longsocial иaccountguards green. DM-OWNERSHIP-IMPLEMENTATION.md + SEARCH-RETAINED-LIFECYCLE.md. Owned cloudGroup instances + отдельный RTCcontroller; GroupA→notificationB→Back и RTCdrawer→Group→Back по1/1 обоими, exactDOM/draft/selection/room сохранены. GROUP-CHAT-OWNERSHIP-REVIEW.md; productionSQL отдельно |
| A23 Сообщение | Anchored popover у сообщения | Tap → компактные прежние реакции + Ответить; swipe-left → reply; clamp у viewport; closes selection/outside/Escape; selectable text не теряется; composer grows, reactions слева снизуtransparent/sendgreen справа, круги фиксированы | Локальныйruntime reply/attachedreactions реализован; DM/group A23browser PASS обеengine черезsafeprovider, RTC/SQLproof отдельно; production four-SQL rollout выполнен03.11: LIVE-SERVER-ROLLOUT-1103.md,19/19schema contracts и новые ACL; реальные signed-in/client/device сценарии отдельно |
| A24 Приглашение в чате | Message-card | Active/accepted/own host/transferred/closed/expired; expired dim+compact без Войти; закрытие host/room обновляет counter/badge даже без чтения чата; offlinehost ошибка не маскирует closedroom | 7cardstates, owner/offline/closed,49-entry fairness, no readACK; background historyAfter, durable Leave/offlineRejoin, oldmetadata и initialinbox epochs не возвращают старые данные/бейджи. Chrome1/1+WK1/1, SQLprojection1/1. FINAL-CACHE-INSTALL-REVIEW.md |
| A25 Аккаунт | Экран с ясным login/signup/recover | Email/password/username; mode labels; busy/validation/error/rate-limit/offline; сохранять ввод/focus; успех возвращает к задаче; nickname/account username/email/password/recover; logout confirmation; guest локальная игра доступна | Готовыйаккаунт безповторногоrestore, cold/identitychange валидируются: ACCOUNT-READINESS-1103.md. ВнутреннийBack/latefeedback/secretclear: ACCOUNT-INNER-BACK-1103.md,6selectedPASS. Exactcandidate20состояний/engine — ACCOUNT-BACK-AND-OUTSIDE-1103.md. Actual recoveryemail delivery отдельно. |
| A26 Параметры | Root + редактор | Avatar/name/account identity единым входом; guest редактирует локальное имя без облака; авторизованный видит актуальные name/@username/email; exit/back reflect auth; не дублировать identity в preferences  Подписи Игры/Обновление; Уведомления под Оформлением; Установить ХОД последним, скрыт при known-installed. | Локальное имя доступно без облака через единый вход личности; отмена/повторное открытие exact7aa — 10состояний/engine, сохранение имени и account lifecycle — 2selectedcase×2engine PASS. [A26 evidence](../../../tmp_files/ux-021/local-profile-review-1103/REPORT.md). Human discoverability/физические устройства и реальные провайдеры остаются открыты. Ревизия03/root-filter-icons: оба движка, порядок/hidden/manualcaption. |
| A27 Общие настройки | Категории/подписанные rows; не панель shortcuts | Громкость/анимации/быстрый ход/обучение по контексту; (?) у параметра; без интерфейсного scale slider; reset последствия; нет повторного account/players/invite; return сохраняет сцену | Текущие вкладки Эффекты/Поведение: единые slider→toggle для громкости/UIзвука и скорости/reducedmotion, безстарой общейподписи. PHONE-FOLLOWUP-1103.md; exactHTML settings в ACCOUNT-BACK-AND-OUTSIDE-1103.md. Старые названия категорий тольковнутренние aliases. |
| A28 Оформление | Галерея образцов | Тема/Компоненты, без вкладки Арты; light beige/dark black; общий акцент12цветов, зелёный по умолчанию, цвета игроков/ошибок сохраняются. Тема/акцент мгновенны; компоненты Apply/Cancel; только игры с вариантами; canonical previews/сброс; галочка поверх образца сверху справа; sticky выбор игры, собственный dropdown | Тема мгновенна; компоненты Apply/Cancel, canonical markers/dropdown. PHONE-FOLLOWUP-1103 — исторический functional gallery proof. Новые найденные P1 крупного текста закрыты source fix: целые Component labels/кнопки/общий header, content-driven reflow без уменьшения шрифта. [A28 text review](../../../tmp_files/ux-021/appearance-text-review-1103/REPORT.md): focused12states/engine Chrome native16/32 + WebKit controlledroot16/32,390/740 Theme/Components/gamepicker,1/1×2; wholewordRange/intrinsic/marker/sticky/footer и visual review. Existing commongeometry before/aftergame1/1×2 после двух stale test-path migrations; asserts сохранены. Это адресный source scope, не physical OSzoom/все families/общий release PASS. |
| A29 Данные | Устройство / Облако | Импорт/экспорт/удаление/квота/default sync/per-entry sync/conflict; guest получает понятный вход; uploading/error/retry; destructive подтверждено; не скрывать единственную копию; account change не смешивает userstorage | Реализация data1; финальный cloud-saves-browser Chromium/WebKit по 1/1, включая late Back/newData и возврат из экспорта/получения копии; fresh fidelity и physical отдельно. DATA-IMPLEMENTATION.md |
| A30 Пакеты | Установлено / Доступно | Catalog/download/install/update/missing dependency/incompatible/offline/error; progress; reorder/hide/favorite не теряются; packs update и app update различаются; back сохраняет root | Новый compact каркас/import preview/Available настоящий SHA/install; shown states приняты. P1 late-completion/durable-delete guards добавлены, selected PackManager по1/1 обоими после изменения. PACKS-IMPLEMENTATION.md + UI-OPERATION-CAPABILITIES.md |
| A31 Справка/правила | Из gamecard/lobby/game; Кратко / Полностью | Brief читается scroll без steps; Markdown; full sticky dropdown TOC; anchors при scroll; contextual(?) отдельным коротким объяснением; нет глобального длинного перечня всех пояснений | Новый reader: общие вкладки, Markdownкратко, fullstickyTOC, контекстное(?); unit3/3, selectedbrowserChrome1/1+WebKit1/1, показанные4readerframes приняты. A31-A33-READER-UPDATE.md; полная интеграция отдельно |
| A32 Оповещения | Верхние banner + счётчики | Success/error/received/decision; не сдвигают layout/scroll; actionable tap открывает связанный screen/panel; timeout/dismiss; badge обновляется без обязательного чтения; важныеupdates только по отдельному поручению | SemanticUIcues/firstgestureunlock/game.startonce: AUDIO-FIRST-GESTURE-ACCEPTANCE.md. Matchingchat bubblepolicy сохранена; outsideRTCregression исправлена в GESTURE-TEST-MAINTENANCE.md. РеальнаяPushdelivery/permissions не доказаны desktop/runtimeпроверками. |
| A33 Обновление | Карточка обновления | Current/newversion, notes, download/progress/ready/applying/success/error/retry; install closes/restarts корректно; back не теряет данные; не застревает на100%; app и pack версии различимы | Always current/check/error/deadline/importantnotice retained; fixedfooter feedback/actions полностьювидимы44px. Presenter/status Chrome2/2+WK2/2; actualChromePWA2/2. UPDATE-STATUS-IMPLEMENTATION.md; iPhone OSrestart отдельно |
| A34 Жесты/движение | Общий contract surfaces/lists | Общий edge-aware механизм всех панелей: нижние вниз, боковые наружу, включая меню и чат; marked preview/menu rows передают pull, сохраняя один tap. Native reading/inertia, inputs/ranges, edit/selection, resize и pinch защищены; короткий/cancelled pull возвращается. Есть tap/Back alternative; reduced motion уважается | CoreInputtouchhold armsдоmotion, tap/blank/cancel ownership; OrderUIlobby/sharedclicksuppression, typedoutside/scroll separation. LOCAL-MOBILE-HAND-GESTURES.md, LOBBY-DRAG-1103.md, GESTURE-TEST-MAINTENANCE.md; browserproof и physicalscope разделены. |
| A35 Состояния | Inline по месту задачи | Empty/loading/stale/error/denied/busy/success; cachedcontent сохраняется при error; понятный retry; disabled причина; tabs не blank/inert; no automaticfocus loss на background refresh | Применимые семейства проверены адресно Chromium/WebKit: cache/loading/error/late ownership; empty/no-results/guest; connection failed/paused/retry/success; update/upgrade recovery; offline-file catalogue; Push pending/denied/setup; invite busy/partial retry; DM/group held ACK/error/retry. Новых локальных A35 blockers аудитом не выявлено. COMMUNITY-DRAG-REFRESH-FEEDBACK.md; ENTRY-IMPLEMENTATION.md; CONNECTION-IMPLEMENTATION.md; UPGRADE-GATE-IMPLEMENTATION.md; CHAT-COMPOSER-BUSY-ACCEPTANCE.md; feedback-021/feedback-p2-acceptance.json. Прямые/SOURCE-only границы36тем сохранены, physical/production отдельно. |
| A36 Подтверждения | Panel последствий, поверх текущего экрана | Close-room/kick/delete/logout/stop/reset: конкретный объект+результат; безопасная отмена; destructive не primary по умолчанию; сохранение контекста; ошибки остаются recoverable | Общий owned confirm и конкретные Cancel/Accept/late guards: PANEL-STACK-IMPLEMENTATION.md, UI-OPERATION-CAPABILITIES.md, CONFIRMATION-OWNERSHIP-ACCEPTANCE.md. Четыре actual RED в kick/roster/freeze цепи исправлены; kick + lobby/game handoff Chromium3/3 и WebKit3/3. Late close ACK cache ownership: LATE-ROOM-CLOSE-ACCEPTANCE.md, по1/1 обоими. Ordinary cancellation/retry/removal сохранены. Это адресные функциональные доказательства, не blanket visual PASS всех destructive вариантов; реальные устройства и production отдельно. |

## Общая матрица условий: применять ко всем A01–A36

| Измерение | Минимальный набор | Признак ошибки |
|---|---|---|
| Viewport | 390×844 portrait; 844×390 landscape; 430 portrait; 360 как нижняя проектная граница | Горизонтальное переполнение, clippedCTA/TOC/keyboard, пустая область вместо activepanel |
| Engine | Chromium и WebKit на тех же viewport; normalmotion + reducedmotion | Повторять browser-specific workaround без общего объяснения; animationneverfinishes |
| Theme | Beige light / black dark | Потеря contrast/различимости icon/selected/disabled/опасного действия |
| Input | Touch/tap/drag; keyboardTab/Enter/Escape; textarea+virtualkeyboard | Focus за modal, background inert навсегда, gesture блокирует вертикальный scroll |
| Persona | Guest/account/recovery; host/player/spectator/table; bot/self/other | Чужие команды/данные; недоступное действие без объяснения; отсутствующий lawful action |
| Data | Empty/one/many/longnames/multiline/hugehistory; active/finished/missingpack/invalid | Переполнение или неверный badge, разные критерии списка и счётчика |
| Async | Pending/success/error/timeout/cancel/stale response; doubletap; close whilepending | Поздний переход после cancel, чужая identity/draft, дубль операции, layout jump |
| Return | Close/Escape/systemBack/внутренний Back/rootnav/reopen | Утрата draft/scroll/selectedtab, неожиданный root вместо родителя, scene remount |
| Orientation | Повернуть в середине forms/chat/search/confirm/connection/game | Потеря введённого, изменение руки/хода, панель вне viewport, неверный field square |
| Offline | Нет сети при входе, cached lists, pending send, update, packs | «Пусто» вместо error/cache; повтор скрывает draft; бесконечный недоступный spinner |

## Очередности обхода на настоящем приложении

Порядок намеренно смешивает пути, чтобы находить проблемы возврата и sharedstate.

| Trace | Действия по порядку | Обязательные наблюдения |
|---|---|---|
| T01 Guest roots | Запуск → локальный nickname → Игры → Общение → Чаты → Профиль → Мои партии → Общение → Игры | Подписи/active state; сохранённая Socialtab; no orphanmodal/inert; root scroll |
| T02 Catalog roundtrip | Каталог3 → favorite → filter → gamecard → close → profilecatalogedit → reorder/hide → done → list → reload | Вид/избранное/порядок persist; cancel card не меняет filters; строка controls+room |
| T03 Guest identity | Профиль identity → localedit → cancel → reopen → save → Settings → Back → theme → roots | Никнейм без облака; cancel no mutation; liveidentity; theme/scenario не remount root |
| T04 Auth return | Общение guestlogin → validationerror → signup/login → cancel → account recovery → success → root → logout | Resume исходной задачи, сохранениеforms/focus, подписанные mode, актуальная identity |
| T05 Game/rules | Gamecard → Brief → FullTOC → anchor → rotate → back → device lobby → readrules → editrules → cancel/save | Read/edit различаются; stickyTOC; mode order; preserved game/preset/scroll |
| T06 Lobby roles | Hostlobby → emptyslot→botmedium → cancel/save → participant spectator → hostoffer/cancel → rules → invite → return | Состав действий заранее; readiness/autoStart причину видно; без manager duplicates |
| T07 Autostart | Одинhost/noother → Ready → bot/add eligibleplayers → unsetready → manualstart toggle → readiness → start | Не стартует без правил/команд; clear primaryCTA;0 countdown не зависает |
| T08 Livegame overlays | Play actualDomino → menu → rules → back → chatpull → resize → type multiline → reactions → close/reopen → rotate → menu | Same field node/bounds при overlays; draft/scroll сохранены; keyboard доступен |
| T09 Conversation | Socialchat → oldhistoryscroll → newincoming → messagepopover → replytap/swipe → draft → search → noresult → back → group | Scroll не скачет; unread decrements только visible/read; draft scoped; anchoredpopover |
| T10 Invite lifecycle | Hostinvite(group) → recipientnotification → conversationcard → preview/join → hosttransfer → closeroom → recipientlist | Single invite; owner обновлён; expired компактно/безCTA; badges decrement без открытиячата |
| T11 Transfer inmatch | Hostoffer → continueplaying → recipientLater/decline → offeragain → accept → bothlobby → returnmatch → finish | Не блокироватьход; outcome banner; state/bot continuation; roles верны; no emergencyhost |
| T12 Results/saves | Завершить actualgame → result → History → root Mygames Active/History → card⋯/swipe → export → deletecancel → rematch | Finished не badge; correct tab/data; savedcopy не потеряна; rematch reset временныепанели |
| T13 Network errors | Joinwrongcode → closedroom → validpreview → connectcancel → retry → success → disconnect→restore → nearbyQR/audiopermissions | Methods/status понятны; success0.5s; no stale navigation; media выключена послеclose |
| T14 Service screens | Profile → Appearance → gamefamily → back → Data device/cloud → importinvalid → back → Packs installed/available → Update fixture | Подписанные назначения, сохранениеbackstate, scopederrors, no realpublish/announcement |
| T15 Interruptions | Во время formdraft открыть notice/transfer → tap panel → rotate → dismiss → browserBack → appforeground | Layout stable; draft/focuscontext сохранены; no hidden blocking surface |

## План финального UX browser walkthrough

1. Использовать **реальное приложение** из существующего `serveBrowserFixture`,
   точный companion и локальные account/network fixtures из существующих тестов.
   HTML lab проверяет выбор внешнего вида, но не поведение приложения.
2. После окончания затрагивающих путей runtime-правок выполнить T01–T03/T05/T08/
   T12/T14 интерактивными действиями в Chromium. Сохранять PNG после окончания
   движения; до и после overlay сравнивать scene node/geometry только там, где нужно.
3. Повторить geometry-critical шаги на WebKit: roots, gamecard/TOC, lobby, chat,
   composer, confirm, orientation. SW-controlled загрузку проверять отдельно;
   `serviceWorkers:block` явно маркировать как ограничение.
4. T04/T09/T10/T11/T13 покрывать имеющимися two-client fixtures и выбранными
   tests; не подменять networkstatus ручной DOM-рисовалкой. Physicalpush и
   QR/audio оставлять неподтверждёнными до телефона. Не отправлять реальные
   приглашения, обновления или сообщения без отдельного поручения.
5. Заполнить нижний журнал для каждого пройденного trace, failures передать
   владельцу модуля; повторять лишь изменённые/упавшие пути. Общее done допустимо
   только после покрытия всех обязательных строк или явного согласованного defer.

## Журнал текущей приёмки

| Evidence | Реально доказанный scope | Ограничение |
|---|---|---|
| root-profile/social/sessions.png; просмотр UX+дизайн | Guestroot header/identity/CTA/tablabels; empty Active composition после обновления22:06 | Не filled/history/online/forms |
| WebKit UI-критик: webkit-ui-{profile,sessions,social,games}.png | Root переходы390, active не inert, overflowfalse, consoleerrors[] | serviceWorkers:block; не landscape/newbucket data |
| case/optional-launch, код-критик PASS1/1 | Login/rename/logout → live rootidentity, rootnode сохранён, Back focus | Другиеauth/forms не доказаны этимcase |
| Table/WebRTC + teamchat адресные PASS | Существующая networkgame/channelhistory, panel без fieldremount | Не вся0.21 UX-приёмка; сообщения/reply и rotation отдельно |
| case/community-actions-browser PASS1/1; community-row-actions.png | Реальный app fixture: DM/group read cursor, сохранение invite badge/scroll, свайп и ⋯, reorder без quickactions, play→gamepicker без отправки приглашений | Local mocked service; не physical/remote, не все orientation; UI review фона строк открыт |
| Account/social scope 02.11 | FINAL-UX-ACCEPTANCE.md: Chrome16/16; WK14/16 +2successful targeted repeats; finalA23bothPASS | Не allA/physicalacceptance. UX-05 закрыт только для DM → профиль друга → Назад: Chrome/WK, сохранены DOM, черновик, selection и scroll310; tmp_files/ux-021/final-review-1103/ux-underlay/report.md. Другие A19-маршруты отдельно |


Уточнение02.11: локальные account/social проверки используют safe fetchport до
nativeSupabase с реальнымSW, не route-onlyWebKit. Полный журнал и ограничения —
`FINAL-UX-ACCEPTANCE.md`. Поделиться в этихtests означает построение ссылки/пароля
и открытие её другим клиентом; настоящий системный share-sheet телефона этим
не подтверждён. Все прежние visualaccepted сохраняются только как исторические
наблюдения; структурную fidelityприёмку ведёт отдельный дизайн-критик.


## Сверка web.dev, отступов и масштабирования — 3 ноября

[WEB-DEV-AUDIT-1103.md](WEB-DEV-AUDIT-1103.md) покрывает38семейств и содержит как исправления, так и оставшиеся рекомендации. ДляA01/A25/A27/A28/A31/A34/A35:11владельцев tablist проверены отдельно по клавиатуре/ARIA;3selectedcase×2engine,6PASS; собственные ошибки Account и естественный Tab занятой формы. Геометрия:36состояний/engine при320/390/740, функциональный clip/insets/центровка; userfont16→32,3представителя игровыхHUD/две ориентации. Два пальца и перемещение при visual zoom не закрывают panel; обычный swipe приscale1 сохранён. Физический pinch/AT не объявляются проверенными. Точный кандидат и общий маршрут54/engine описаны в текущем LOCAL-CANDIDATE.md.


Масштабирование Data/библиотеки и вкладок: [TEXT-SCALE-FOLLOWUP-1103.md](TEXT-SCALE-FOLLOWUP-1103.md), native16→32,42геометрических состояния и64точного HTML/движок, временное превью опубликовано. Это не закрывает непроверенные роли, physical/AT и самостоятельную usability-приёмку строк A01–A36.


Фоновое обновление/общий баннер: [UPDATE-NOTIFICATION-FOLLOWUP-1103.md](UPDATE-NOTIFICATION-FOLLOWUP-1103.md). Source UI/worker/native font,70состояний exactHTML/движок, публичные bytes и живой metadata ID проверены отдельно. Роли, физический upgrade уже установленной PWA, Push доставка и самостоятельная usability не объявлены закрытыми.


Дополнительная проверка неизменённого опубликованного кандидата: [PWA-UPGRADE-1103.md](PWA-UPGRADE-1103.md). Точный переход прошлое→текущее превью одного version, реальный HTTP-обрыв/retry,220reused files,282149скачанных байт без повторной передачи паков; один reload, сохранённая партия/профиль и offline15игр: Chromium1/1PASS. Это не физический Home Screen или внешние сети. RoadMap361/work/readback. Runtime не менялся; новой сборки/публикации нет.


Общая формулировка количества действий: [COUNTER-WORDING-1103.md](COUNTER-WORDING-1103.md), четыре consumer-пути, canonical plural и typed count, unit2/2 и saved-case1/1×2, временная публикация проверена отдельно. Это исправление копирайтинга не закрывает прочие исходные требования A01–A36 и физическую/независимую usability-приёмку.


Продолжение source/published scope03.11: [RULES-REFLOW-AND-TYPE-1103.md](RULES-REFLOW-AND-TYPE-1103.md). A01/A02: actual header axes/44px, content-driven catalog reflow405card-state/engine и nav-word typography12states/engine; ChromeactualdefaultFont16→32, WKcontrolledroot. A08: declaredchoices save validation и локальный lawful ownership editor lifecycle. Точныйcandidate7aa60d95…d0333d503,4publicbytes/liveworker. Эти результаты не заменяют physical/AT/реальные сети/Push/независимую usability всехA01–A36.


Production boundary03.11: [LIVE-SERVER-ROLLOUT-1103.md](LIVE-SERVER-ROLLOUT-1103.md). Четыре узких SQL отдельно одобрены и применены,19/19fingerprints,10body matches и новые RLS/ACL проверены. Это закрывает прежний «DDL не применялся», но не user/device/provider/realRTC/AT/usability gates и не глобальную security-приёмку.
