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

# Текущее превью: понятная прокрутка к цели обучения

[GUIDE-SCROLL-1104.md](GUIDE-SCROLL-1104.md): опубликован HTML `8391cdfac708`, cache `c6b4c9a9fffe531a`. Невидимая цель получает scroll-направление; поле не прокручивается автоматически. Исправлена привязка указателя при root scrollbar gutter. Механизм6сценариев×2engine, learning13goals×2engine и native touch-pan0→180 без хода с последующим legal tap PASS. Build8SHA/3ZIP/source246; public4/4; live/offlineDomino/save/profile PASS. Default-варианты/physical/AT/usability/остальная GOAL открыты.

## История

Адресное дополнение 04.11: [обучение обоих пасьянсов](SOLITAIRE-LEARNING-1104.md) — все 13 отдельных целей пройдены через реальные UI-команды/валидированные позиции, 1/1 Chromium + 1/1 WebKit, прогресс и чек-листы сохранены после reload. Варианты undo:history/manual flip названы явно; default-настройки, физические устройства и offscreen-target usability не закрыты. Runtime/превью b3f3c8 неизменны.

# Текущее превью: точечный HTML-разбор колонок

[FRAGMENT-PARSER-1104.md](FRAGMENT-PARSER-1104.md): опубликован HTML `b3f3c8f25729`, cache `f6a6c74b38a10caa`; companion/паки прежние. Настоящий Spider разбирает3колоночных фрагмента/17карт, а не весь tableau54карт. DOM regression Chrome/WebKit по1/1 сохраняет draft/caret/scroll17/WAAPI; skins обеих игр×2engine PASS, nativeSpider/Klondike PASS, ordinaryUNO/audience PASS. Build8SHA/3ZIP/source246, public4/4, live/offlineDomino/save/profile PASS. Внешний recipe/dirty signals/остальные игры/~100мс/fullGOAL остаются открытыми.

## История

# Текущее превью: регионы колонок пасьянсов

[SCENE-REGIONS-1104.md](SCENE-REGIONS-1104.md): опубликован HTML `c7bcd6644915`, cache `4f8f6a39e54000d5`, collection0.8.9-preview.4. Неизменённые tableau колонки повторно не строят SVG; настоящий Spider10изображений/54карты. Views22/22+undo/draw1/1, nativeSpider/Klondike по1/1Chrome; skin-after-command обеих игр1/1Chrome+1/1WebKit. Build8SHA/3ZIP/source246; public4/4; live activated/15games/protocol1; offline reload/coldPage/Domino/save/profile PASS. Внешний полный recipe/HTML-парсинг, остальные игры/physical/network/AT/usability остаются открытыми.

## История

Адресное исправление04.11: [регионы колонок пасьянсов](SCENE-REGIONS-1104.md) — неизменённые колонки не строят SVG повторно; реальный Spider10изображений/54карты,views22/22+расширение1/1,nativeSpider/Klondike по1/1Chrome. Кандидатc7bcd6 ещё не опубликован; внешний полный recipe/парсинг и остальная матрица открыты.

# Текущее превью: стабильная активация паков

[PACK-ACTIVATION-1104.md](PACK-ACTIVATION-1104.md): опубликован HTML `8b9cad73c30c`, cache `67c23a167730e3f0`. Повторная активация неизменённого пака сохраняет registries; восстановление внешней замены/CSS/версий и rollback проверены (packs-reconcile4/4,view-contract11/11). ExactHTML Spider сохраняет renderer identity, move0→1, busyfalse/errors[]. Build8SHA/3ZIP/244source; public4/4; live activated/15games/protocol1/errors0. Полный renderer,~100мс,вся матрица игр/устройств/сетей/AT/usability остаются открытыми.

## История

Адресное исправление04.11: [идемпотентная активация](PACK-ACTIVATION-1104.md) — packs-reconcile4/4,view-contract11/11, exactHTML Spider stable renderer/commit/no busy. Кандидат8b9cad ещё не опубликован; публичное04086e сохраняется. Полный renderer/~100мс остаются открытыми.

Адресное уточнение04.11: [границы полного рендера](SCENE-BOUNDARY-PROFILE-1104.md) — настоящий перенос Spider всё ещё строит10колонок/54карты; выявлена повторная регистрация пака перед рендером. Это открытые дефекты, а не готовность SDK/0.21. Превью04086e неизменено.

# Текущее превью: закрытие выбора карты тапом снаружи

[CARD-CHOICE-BACKDROP-1104.md](CARD-CHOICE-BACKDROP-1104.md): опубликован HTML `04086ea4d13b`, cache `84a430bec66be2f8`. Native touch/mouse закрывают общий карточный диалог без команды и click-through; Chromium/WebKit по 1/1, PlayerTarget 3/3. Build 8 SHA/3 ZIP; source ZIP 243 файла; public 4/4; live activated/15 games/protocol1/errors0. Полная приёмка 0.21, физические устройства, реальные сети, usability и работа над ~100мс/full markup остаются открытыми.

## История

# Адресное дополнение: compiler baseline

[COMPILER-BASELINE-1104.md](COMPILER-BASELINE-1104.md): прежний compiler gate закрыт для текущего companion, весь model-contract21/21PASS. Полное равенство15подготовленных bundles сохранено; сравнение с moving GitHEAD заменено на independently prepared installed-packs2fee8a. Mistune установлен в отдельный authoring venv. Runtime/previewbe443f неизменны; fullGOAL/~100мс/fullmarkup/physical/network/usability остаются OPEN.

## История

# Текущий кандидат: отложенная копия рубашки

[DEFERRED-STOCK-1104.md](DEFERRED-STOCK-1104.md): published be443f/cacheaa9980. Deferred move без transfer/reveal не копирует stock back; раздача/request и legacy сохраняют полную независимую замороженную копию. Исправлена пойманная до публикации ошибка первого открытия shared history. Motion20/20×2,feedback19/19,UNO penalty/history×2, native solitaires/source и exactHTML6states/engine; build8SHA/3ZIP/230runtime+2locale+11tests/public4bytes/livePASS. SVG-style фильтр отклонён; click90,33→90,33мс не подтверждает ускорения. ~100мс/fullmarkup/compiler-baseline/полная15game+physical+network+usability приёмка остаются OPEN; GOALwork.

## История

# Адресная проверка: передача хоста в лобби

[RTC-LOBBY-TRANSFER-1104.md](RTC-LOBBY-TRANSFER-1104.md):3реальных локальных RTC peers, существующийcase1/1Chrome+1/1WebKit на exactHTML d35652. Decline/accept сохраняют room/rules/seats, ready сброшена, новый host начинает партию, после закрытия старого host новый ход достигает третьего участника revision0→1. Pageerrors/Supabase0. Runtime/preview неизменны; это не внешняя сеть/устройства/Table/spectator/playing-handoff/autoStart или полныйGOAL.

## История

# Адресная проверка: звуки интерфейса

[UI-AUDIO-ROUTES-1104.md](UI-AUDIO-ROUTES-1104.md): first-native-touch casePASS Chrome/WebKit, прежние9notification cases сохранены; ещё10сценариев/engine и14нативных звуковых источников для connection/foreground handoff, повторы/отмена/чужой room/recipient тихие, MessageChannel ACK проверен. Runtime/preview d35652 неизменны. Это не OS Push delivery, physical слышимость, realRTC или все15игр; полныйGOAL и~100мс/fullmarkup остаются work.

## История

# Адресная проверка: Стихийная потасовка

[MAGE-EFFECTS-1104.md](MAGE-EFFECTS-1104.md): исторический RED loot/effects не воспроизвёлся на текущем d35652;3существующих case×2engine PASS (loot/privacy,4elements/damage/death/fall,playback/pause/rate/reduced+mock sound calls). Runtime/preview неизменны; WebKit offline navigation failures сохранены, HTTP exact-response route прошёл. Это не WebAudio/physical/network/allgame acceptance. Остатки из SNAPSHOT-COPIES-1104.md и полныйGOAL остаются work.

## История

# Текущий кандидат: повторные копии immutable-позиций

[Отчёт и границы](SNAPSHOT-COPIES-1104.md): published d35652/cache0d9146. Внутри вызовов адаптера переиспользуется проверенный глубоко замороженный снимок; внешние значения по-прежнему проверяются/копируются. Core81PASS +selectedcontracts, exactHTML solo6/engine и context8/engine, build/SHA/ZIP/public/livePASS. Wholemodel-contract20PASS/1compiler-baselineFAIL сохранён отдельно; первый liveblank не объяснён, диагностический повторPASS. Замер click90,20мс против89,97/89,44мс не доказывает ускорения. ~100мс, полная authored-разметка и полное15game/physical/network/usability покрытие OPEN; GOALwork.

## История

# Текущий кандидат: ввод, раскладка пасьянсов и контекст меню

[Отчёт и границы](INPUT-AND-SOLO-LAYOUT-1104.md): опубликован764ea7/cache d0af3c. Исправлены пустые зоны пасьянсов, внешняя прокрутка скрытой сцены, пересечения заголовка и возврат к истории/форме настроек. Реальный response SHA готового HTML подтверждён:6состояний/движок,8font/header+2wrapped Chrome; контекст8снимков/движок. Build/SHA/ZIP/public4bytes/live activated PASS. Все15игр, physical/audio-delivery/realnetwork/AT/usability, остаточная задержка~100мс и полная authored-разметка остаются OPEN; GOALwork.

## История

# Текущий кандидат: звуки, обучение и продолжение партий

[Отчёт и точные границы](FUNCTIONAL-AUDIO-LEARNING-1104.md): опубликован488e6f/cache1a3d81; поздний UNO ACK не оживляет timer, понятнее global/local подсказки и доступнее история. Native incoming audio9сценариев/engine, selectedtutorial4case×2, Ludo/UNOcontinuation×2 и exactHTML12states/engine; nativeChromeFont32ещё12, build/SHA/ZIP/public/livePASS. Полное15game/physical/audio-delivery/realnetwork/AT/usability покрытие, ~100мс и monolithicmarkup остаются OPEN; GOALwork.

## История

# Текущий кандидат: устранение лишних вычислений

[TARGETED-RENDER-1104.md](TARGETED-RENDER-1104.md): опубликован9ad647/cache7478ca;230runtime/sourceZIP,30exactHTML states/engine,4publicbytes/liveactivated PASS. Убраны лишняя копия authority payload, повторные stylesheet записи/clone style reads и одинаковые input renders. Проверки input/motion/privacy пройдены; контролируемая задержка100,5→99,7мс НЕдоказывает заметного ускорения, ~100мс остаётся OPEN. Следующий SDK запланирован отдельно; полный0.21 GOAL/physical/audio/realnet/usability остаются work.

## История

# Текущий кандидат: точечная геометрия и обучение

[Проверенный scope и остатки](POINTWISE-LEARNING-1103.md). Published94c44/cache65d808;74exactHTML states/engine, public4bytes и live activated worker совпали. Общий layout обычных действий устранён; authored markup на ревизию и остаточная задержка99мс ещё открыты. UNO13native-input и localRTC×2, Klondike/Spider обучения и адресные geometry cases прошли. Полный GOAL/physical/realonline/audio/performance остаются work.

## История

# Текущий срез: A13 preview

[A13-ROOM-ACCESS-PREVIEW-1103.md](A13-ROOM-ACCESS-PREVIEW-1103.md): опубликован457b/cacheb9b7; исправленыдоступNetwork/notification/ownership/copy/крупныйтекст.8selectedUI+unitPASS,28exactstates/engine/public/live; дополнительныйRTCcaseнеPASS из-заstale testpath. ПолныйGOAL, physical/realonline/performance/humanusabilityостаютсяоткрытыми.

## История

# Текущий срез: оформление при крупном тексте

[APPEARANCE-TEXT-REFLOW-1103.md](APPEARANCE-TEXT-REFLOW-1103.md): исправлены разрывы слов в галерее, footer и общем header; подтверждён локальный редактор A26. Publishedb802/cache11569, exactHTML70/engine и live/public bytes совпали. Адресная typography12states/engine, common geometry32records/engine и независимый просмотр PNG. Это прогресс, не завершение полного GOAL: физические устройства/Push/RTC/AT и human usability остаются открытыми. Серверный рубеж19/19 не заменяет реальные пользовательские цепочки.

## История

# Серверный прогресс03.11

[Четыре одобренных SQL](LIVE-SERVER-ROLLOUT-1103.md) применены к тому же рабочему Supabase-проекту.19/19schema contracts,10routine bodies, RLS/прямые привилегии новых четырёх tables и operational preservation проверены независимо по execution artifacts. Provider smoke/user-row tests/announcements не выполнялись. Клиент7aa/cache6c3 прежний; metadata postflight не закрывает real signed-in/device/Push/RTC/AT/humanusability. Advisor notices и freshness границы приведены отдельно, blanket security PASS отсутствует. Общий GOAL остаётся active/work.

## История

# Проверенный срез: правила и доступное перестроение текста

[Отчёт](RULES-REFLOW-AND-TYPE-1103.md), candidate7aa60d95…d0333d503/cache6c3fc9fff2fa5ba1. Подтверждённый save-validation дефект исправлен до commit; ownership-editor маршрут проверен на локальных handoff-портах. Исправлены общий header offset/available-width, catalog reflow и application chrome при2× без разрывов слов. Source gates и независимый визуальный просмотр перечислены отдельно; exactHTML70/движок и public/live совпали. Это прогресс, не полная приёмка GOAL: физические устройства, AT, независимая человеческая usability, реальные сети/Push остаются открытыми.

## История

# Ревизия 3 ноября: новый проверенный срез

[FINAL-REVIEW-1103.md](FINAL-REVIEW-1103.md): четыре роли, root review и адресные исправления async CloudSaves, composer/жестов, обрезанных рамок, каталога и touch UI-фокуса. Итоговый кандидат883dd124…b8b0 опубликован во временном Funnel; exactHTML70состояний на движок, публичные bytes и живой cache совпали. Это не закрывает общий GOAL, физические устройства, AT, реальную доставку Push или независимую человеческую usability. Игровые выделения не отключались.

## История

# Текущий кандидат: единый перевод счётчиков действий

`counter-wording/final`, standalone SHA256 `ea02abc81a8c3c3a5e171ae012f49887fb9532605de4325c268269c05422ae7a`, cache`83d9a4d71587371e`. [Правка и проверки](COUNTER-WORDING-1103.md): «1 действие /2 действия /5 действий» через общий Intl-plural в продолжении, сохранениях и сетевых архивах. Unit2/2; saved-case Chrome/WebKit1/1, включая реальную запись из1действия. ExactHTML70/engine с обычной анимацией;8SHA/3ZIP CRC;230runtime+2canonical locales/sourceZIP совпали. Временный Funnel443/8443 и /hod-021.html обновлён;4publicbytechecks и live activated/cache metadata PASS. RoadMap362/work/readback. Общая цель и physical/AT/Push/usability остаются открытыми.

## История

# Текущий кандидат: фоновое обновление без самопроизвольной навигации

`update-notification-followup/final`, standalone SHA256 `277f2720a226ee4795b44499f4b1540c0e98d21f3f6dcf07e4dc6fbf55a3c286`, cache`36be9605c0aa4734`. [Изменения и точный scope](UPDATE-NOTIFICATION-FOLLOWUP-1103.md). Общий верхний баннер/явное Открыть, сохранение фокуса/DOM, перенос при большом тексте; разные сборки одного version различаются по worker metadata cache ID. Source UI1/1×2, native font1/1, worker unit1/1; exactHTML70состояний/движок с обычной анимацией.8SHA/3ZIP CRC,230runtime+worker/sourceZIP совпали. Funnel443/8443 и /hod-021.html обновлены;4publicbytechecks PASS (полный standalone SHA по12HTTP206 частям), live activated worker/cache и metadata ID совпали. RoadMap360/work/readback. Общий GOAL, physical/AT/Push/usability остаются открытыми.

## История

# Текущий кандидат: масштабирование текста и переносы

`text-scale-followup-verified/final`, standalone SHA256 `66db10b2dd95b168e3411035be4a779d559fa5e8d1df29f06ccb6e13c20b2578`, worker cache`0a7c55452f871205`. [Исправления и точные границы](TEXT-SCALE-FOLLOWUP-1103.md). Полная временная PWA с15играми обновлена в Funnel443/8443 и /hod-021.html;4public bytechecks и live activated worker PASS. Native font16→32 на реальных Data/Pack; geometry42состояния/движок, exactHTML64/движок Chromium/WebKit.8SHA/3ZIP CRC,230runtime/sourceZIP+manifest совпали. RoadMap revision358/readback, статусwork. Общая цель и физическая/независимая usability-приёмка остаются открытыми.

## История

# Текущий кандидат: аудит web.dev, общая типографика и ввод

`web-dev-audit/final`, standalone SHA256 `4b9594bdab0e1da82e806aecc8176e8abee7895e8eae7ce849e773646429dc1d`. Полная временная PWA с15играми обновлена в Funnel443/8443 и /hod-021.html. [Сверка38семейств, исправления, доказательства и остатки](WEB-DEV-AUDIT-1103.md); [клавиатура/формы](WEB-DEV-KEYBOARD-FORMS-1103.md); [геометрия/масштаб](WEB-DEV-GEOMETRY-SCALING-1103.md). Точный HTML54состояния/движок,8SHA/3ZIP CRC,230runtime/sourceZIP+manifest совпали. Публичные bytes4/4 совпали; worker activated с точным cachedb1e692c4d13a973,15игр/PushManager. Полные evidence и ограничения — final-manifest.json. Общий GOAL остаётся незавершённым.

## История

# Актуальный срез: Back аккаунта и outside-dismiss

Новый кандидат — `phone-back-1103/final`, SHA256 `71c0e9b37ba39d9fa44357226a7aa1f7c385c1ae7e43af0de8cf7cd13c0cd644`. Полная PWA обновлена в Funnel443/8443 и `/hod-021.html`; новый worker activated/cache77db4288e0ca1ed1. [Изменения, адресные проверки и ограничения](ACCOUNT-BACK-AND-OUTSIDE-1103.md). Предыдущая телефонная ревизия включена;6account sourcePASS и20состояний exactHTML/движок,8SHA/3ZIP CRC,230runtime/source ZIP и manifest совпали. Общий GOAL остаётся незавершённым; физическая/usability/Push/server приёмка отдельно.

## История предыдущих срезов

# Актуальный срез: телефонная правка3ноября

Текущий кандидат — phone-polish-1103/final, SHA256 `5ee6ecfd8bbc0b6e7b4806b3b71fa2ea94a6c01dbf08cc7ac345448d86354e35`. [PHONE-POLISH-1103.md](PHONE-POLISH-1103.md) фиксирует общий акцент, финальные пропорции/капсулы каталога, installed-PWA detection и ограничение длинных подписей. Source адресные проверки и root exactHTML24состояния/движок прошли;230runtime/source ZIP +manifest совпали, Funnel обновлён и новый worker activated.

Остатки прежние: физические устройства и исходный DnD/полоса, реальная Push-подписка/доставка, внешние сети и самостоятельная usability-приёмка. Серверная выкладка и штатный релиз отдельно. Это прогресс по новым уточнениям, не доказательство полного GOAL. Ниже история предыдущих срезов.

# Актуальный срез 3 ноября: общий вход поверхностей

Текущий кандидат — `nonmodal-entry/final`, standalone SHA256
`60f744e2a2dee617bc38dc2fb8ee1a7a1ee4afaacc3caea2925c867df98712ac`.
Это опубликованное временное полное PWA-превью Funnel, не штатный выпуск.
Идентификаторы и ссылки: [LOCAL-CANDIDATE.md](LOCAL-CANDIDATE.md).
Ниже сохранена история: утверждения прежних срезов «публикации не было» и
«blocked» относятся к соответствующим этапам, а не к текущему состоянию.

| Условие GOAL | Подтверждено | Ещё требуется |
|---|---|---|
| Реализация и единообразие | A01–A36 с адресными evidence; телефонная ревизия2; общие вкладки и оболочки; единый lifecycle входа модальных и немодальных поверхностей | Согласование оставшихся расхождений владельцем; локальные проверки не равны общей приёмке |
| Реальные цепочки | Сохранённые provider/RTC/archive проверки; новый вход: 8 browser cases и 8 unit; точный HTML: 24 состояния на движок с обычным движением | Реальные внешние сети, production capabilities и Push-подписка/доставка |
| Движки, жесты, ориентации | Chromium/WebKit в указанных существующих сценариях; 230 runtime-файлов совпадают со snapshot, drift отсутствует | Физические iPhone/Pixel/Android, системная клавиатура, установка/Home Screen, разрешения; телефонный missing-DnD пока не воспроизведён |
| Независимость проверки | Сохранены заключения специалистов и root-проверка точного артефакта | Самостоятельные задания новому пользователю без подсказок; маршрут в OWNER-ACCEPTANCE.md не является результатом |
| Публикация и документы | Публичные байты root/SW совпали; новый worker activated, 15 игр и PushManager; облачный RoadMap revision354 оставляет карточку work | Штатный выпуск и production-выкладка отдельно от разрешённого Funnel; SERVER-ROLLOUT-MANIFEST.md остаётся PENDING |

Подробности новых проверок и границы переиспользования старых результатов:
[NONMODAL-ENTRY-LIFECYCLE.md](NONMODAL-ENTRY-LIFECYCLE.md).
Наличие PushManager не доказывает подписку или доставку. Общая цель active,
не complete. Повторять неизменённые зелёные проверки ради нового отчёта не нужно.

## История

# Продолжение 3 ноября: телефонная проверка

Предыдущее продолжение — прогресс: отдельный облачный вход, честное состояние Push/повтор, воспроизведённый и исправленный native touch capture bug и разрешённая полная PWA в Funnel. Точная сборка/доказательства — PHONE-REVIEW-1103.md и LOCAL-CANDIDATE.md. Последние результаты не заменяют usability/physical/external Push приёмку; общий GOAL не complete. Ниже сохранена история прежних срезов.

# Приёмка цели0.21: текущий срез и история

## Текущий срез после последних уточнений ревизии03

Кандидат final-reviewed SHA290cf8de98fa41cc1dab503c4b123677157e4d3909246a4c81705a123292ded1.
Последние подписи/порядок, иконки фильтра/центр звезды, только-screen fullscreen,
History в меню и компактные карточки включены. Независимый root actualHTML:
80core+18social/движок, Mage case1/1/движок;8SHA/3ZIP корректны. Детали и границы
— OWNER-ITERATION-03-ACCEPTANCE.md / PERFORMANCE-AND-DATA-AUDIT.md.

Все затронутые локальные задачи этой ревизии имеют source/targeted evidence.
Отчёт аудита сохраняет немеренные SQL/Presence candidates отдельными от P1fixes.
Готовность телефона/внешнихсетей/Push и полное usability принятие владельцем
этим не подменяются. Публикация/production SQL/рассылка не выполнялись.
Общий GOAL не помечен complete; предыдущий blocked относится к этапу до новых
указаний владельца. Ниже сохранён хронологический журнал прежних кандидатов.


Новая ревизия владельца03 возобновила локальную работу: OWNER-ITERATION-03.md.
Ниже сохранён предыдущий аудит; прежний blocked не является текущим запретом
на исправления по новым скриншотам. Публикация этим не разрешена.

## Текущий срез после A36, 02.11.2026

Предыдущий goal-turn был прогрессом: source/evidence сверка выявила и закрыла
ошибки владения поздними операциями, а не только внешний gate. Текущее продолжение
удалило доказанно недостижимый legacy handler переключения слотов, актуализировало
устаревший номер в плане публикации и подготовило отдельный cleanup-кандидат. Четыре kick/roster/freeze RED и
late-close cache RED исправлены; адресные запуски Chrome4/4+WebKit4/4 прошли.

| Условие GOAL §9 | Текущее доказательство | Остаток |
|---|---|---|
| A01–A36 и поздние уточнения | ACCEPTANCE-MATRIX, OWNER-ITERATION-02, source и scoped acceptance records; A35/A36 актуализированы | Все состояния/роли не объявлены одним blanket PASS; см. точные границы строк |
| Соответствие и понятность | Независимые design/UX и root actual-artifact проходы, исправленные оси/карточки/плотность | Финальный кандидат ещё не принят владельцем и новыми пользователями |
| Реальные операции/цепочки | Existing provider/RTC/IndexedDB проверки; новый A36 actual RED→GREEN; сохранены lobby/game handoff и bot finish | Live managed services, внешняя сеть и реальная Push-доставка не доказаны локальными fixtures |
| Движки/ориентации/ввод/motion | Chromium/WebKit, representative15-pack geometry, native touch/popover, normal/reduced, scoped keyboard/focus | Физические iPhone/Pixel/Android, OS-клавиатура/меню/Share/HomeScreen/permissions/textscale |
| Команда и ведущий | Независимые design/UX/UI/code отчёты; root source/hash/artifact review | Ограничения явно сохранены; нет общего утверждения о production/device PASS |
| Документы/RoadMap/evidence | LOCAL-CANDIDATE, эта матрица, новые ownership records и общие стандарты | Публикация и серверная выкладка отдельно разрешаются и принимаются |

Текущий HTML — review-03-cleanup, SHA256
`fbb0ce7dbaa366bc2542a0ce2918cc7e6d8af18ff096e4a86d098ac0810d1ee1`.
От ownership-кандидата удалена только недостижимая функция cycleRoomSeat;
точное вычитание из предыдущего source ZIP и189runtime hashes это подтверждают.
Canonical build exit0,8SHA/3ZIP CRC корректны, runtime source drift0.
Старые зелёные проверки не повторялись без зависимой причины; изменённый общий
freeze дополнительно проверен реальной передачей хоста в лобби и партии.

RoadMap обновлён и прочитан обратно: ревизия347, карточка work.
Общая цель остаётся active/work, не complete. Дальнейшие внешние шаги:
OWNER-ACCEPTANCE.md, PUBLICATION-PLAN.md, SERVER-ROLLOUT-MANIFEST.md. Разрешения
на публикацию/production SQL/рассылку этим продолжением не получены.

## Текущий аудит внешнего блокера после возобновления

После возобновления цели прежний blocked не переносился автоматически. Последние
окончания goal-turns последовательно оставляли один и тот же внешний gate:

1. Motion-кандидат: локальные исправления и проверки завершены; нужны физическая
   приёмка и отдельное решение о публикации.
2. A36-кандидат: устранены подтверждённые гонки; тот же gate остался.
3. Cleanup-кандидат: удалён мёртвый обработчик и актуализирован план; тот же gate.
4. Текущее продолжение:189runtime hashes без изменений, SHA cleanup-кандидата
   подтверждён, все субагенты terminal/completed. Нового ответа/разрешения или
   физических результатов в переписке нет; новые процессы не ожидаются.

Первые три тура были прогрессом, не no progress: реальные изменения и проверки
сохранены. Текущий повтор не меняет продукт или следующий доступный шаг и не
является verified wait. Ранее возникший внешний блокер повторён более трёх
последовательных goal-turns; теперь независимой локальной работы не осталось.
Нельзя создавать задачи или повторять зелёные проверки ради обхода этого gate.

Цель переводится в blocked, не complete/paused. Полный исходный объём сохраняется.
Возобновление требует решения владельца о публикации/сервере и/или результатов
реальной приёмки по OWNER-ACCEPTANCE.md. Подготовленный конкретный кандидат и
порядок выкладки — LOCAL-CANDIDATE.md / PUBLICATION-PLAN.md. AGENTS.md прямо
требует отдельного поручения на релиз/публикацию. Ни production, ни рассылка не
изменялись; RoadMap-карточка остаётся work с явно указанным внешним gate.

## История предыдущих этапов


02.11.2026. Предыдущий шаг был **прогрессом**: изменены runtime установки/владения
чатами, получены адресные Chromium/WebKit результаты, собран кандидат и обновлена
облачная ревизия338. Это не первый повтор внешнего блокера; доступная локальная
работа продолжается. Общий статус цели — active, карточки — work.

## Условия завершения из GOAL §9

| Условие | Авторитетные свидетельства | Текущий вывод |
|---|---|---|
| 1. A01–A36 реализованы по выбранным решениям, старые дубли убраны | ACCEPTANCE-MATRIX; текущие source modules; отдельные реализации; DESIGN-ACCEPTANCE / FINAL-UX-REVIEW-NOW | Структура и выбранные состояния проверены; нельзя объявить все реальные внешние операции принятыми на fixtures |
| 2. Соответствие прототипу/поздним указаниям, понятность | PROTOTYPE-FIDELITY, неизменный export7/prototype, all36 paired HTML, независимые design/UX и root screenshots | Локальные сравнения есть; финальный candidate ещё не принят владельцем/новыми пользователями |
| 3. Реальные операции и цепочки без потери состояния | LONG-SOCIAL-MIGRATION, GROUP-ROOM-OWNERSHIP-IMPLEMENTATION, GROUP-CHAT-OWNERSHIP-REVIEW, Search/cache lifecycle, protocol/privacy evidence | Combined handoff/back→nativebot→durable finished→automatic result→sameLobby подтверждён Chrome2/2+WK2/2 на TicTacToe. Production contracts и внешняя доставка не подтверждены |
| 4. Ориентации/движки/семейства/ввод/жесты/motion | ACCEPTANCE-MATRIX, platform/geometry/actualRTC cases, WEB-DEV-AUDIT, текущий root33core+9social walkthrough | Chromium/WebKit и локальные взаимодействия доказаны адресно; реальная OSkeyboard/textscale/ShareSheet/HomeScreen/Back остаются физической приёмкой |
| 5. Четыре специалиста и ведущий независимо ревьюят | DESIGN-ACCEPTANCE, FINAL-UX-REVIEW-NOW, UI-PLATFORM-REVIEW-03, FINAL-CODE-ACCEPTANCE, ROOT-FINAL-REVIEW и их точные оговорки | Ревью проведены, поздние конкретные findings исправлены. Это не отменяет оставшиеся явные ограничения |
| 6. Документы/RoadMap/стандарты/evidence актуальны | GOAL, матрица, TEAM-WORKFLOW, LOCAL-CANDIDATE, cloud card ux-021-room-flows | Идёт reconciliation исторических gates; ранние «нужен перенос» не считаются новым блокером или текущим PASS |

## Доступные локальные действия

1. UI завершил bounded extension существующего live host-transfer browser case:
   legal deterministic preparation, actual consent/pending play/back handoff,
   scheduled bot terminal action и automatic result→sameLobby обоих peers.
   Spectator/table, Chrome2/2+WK2/2, errors/native0; HANDOFF-COMPLETION-ACCEPTANCE.md.
   Proof-game TicTacToe, отдельные Ludo/прочие исходные проверки не расширены.
2. Code закрыл реальный packaging gap: full setup/check не включали
   host-transfer Push extension. Extension добавлен в существующий generator с18function fingerprints и
   exact trigger check (19строк). Existing PostgreSQLcase1/1, включая negative
   проверки disabled trigger/altered helper/exposed EXECUTE и rollback.
   SERVER-ROLLOUT-MANIFEST.md задаёт2required+2conditional артефакта.
   Это локальная упаковка, не разрешение применять SQL в рабочей базе.

3. Root восстановил entry fullscreen из Hub в «Настройки → Доступность».
   Existing fallback case мигрирован с удалённых элементов и ручного масштаба:
   оба root-раздела/ориентации/scroll/modal lock прошли Chrome/WebKit1/1.
   Конечные active destination/карточки также проверены обоими;
   captures ждут завершения анимации (ранние кадры сохранены отдельно);
   native Safari остаётся отдельным physical scope.
4. Code подтвердил tutorial ownership RED: принятый поздний restart трогал
   новое/приостановленное окно, Escape дочернего окна помечал underlying offer.
   Исправление ограничено TutorialSettings и существующим case;
   Chrome/WebKit1/1, обычный reset/cancel/другой pack не сломаны.
   TUTORIAL-OWNERSHIP-ACCEPTANCE.md фиксирует RED и final sourcehash.

## Состояние после локальных исправлений

Тот же candidate пересобран из-за изменившейся упаковки/fullscreen/tutorial,
все8существующих SHA256SUMS прошли, точные SQLhash совпадают с operator manifest.
Прежняя сборка сохранена отдельно, результаты затронутых проверок перечислены. Не повторять неизменённые browser/pack suites. Предоставить
владельцу HTML и короткий маршрут приёмки. Отдельно остаются production rollout,
managed services, реальные телефоны/сети/Push. Пока нет этих свидетельств, общий
complete не выставлять и не переопределять цель как «только локальные скриншоты».

## Решение о публикации

Read-only Pages API подтвердил существующую GitHub Pages площадку, HTTPS и main.
Текущий workflow не создаёт изолированный preview: публикация заменит приложение
на главной странице. Distribution provenance показывает input0.20.0; это не
проверка версии уже исполняемого runtime. Exact snapshot и журнал —
tmp_files/ux-021/publication-readiness/.

PUBLICATION-PLAN.md подготовлен до запроса разрешения. Вопрос владельцу поставлен
о0.21.0-preview.1: интерфейс+совместимые SQL, только интерфейс или пока локально.
До ответа не выполнять reseal/rotation, push/dispatch, SQLapply или рассылку.
Предыдущий шаг был прогрессом (новые authoritative hosting facts и concrete plan);
текущий внешний gate — первое явное ожидание решения, не три повторённых блока.

## Аудит внешнего блокера: третье последовательное продолжение

1. Исходный шаг: read-only hosting facts и конкретный PUBLICATION-PLAN; вопрос
   владельцу о разрешении публикации и серверной выкладки. Это был прогресс,
   но внешний блокер уже возник и был явно назван.
2. Следующее автопродолжение: источники кандидата не изменились, ответа нет.
   Это no progress, не verified wait: живой job не ожидался.
3. Текущее автопродолжение: повторно подтверждены неизменные tracked sources
   и отсутствие нового решения в переписке. Не требуется повторять зелёные
   проверки или создавать новые задачи ради обхода внешнего gate.

Тот же блокер повторился трижды. Необходимые дальнейшие действия зависят от
решения владельца: publication/SQL gate по AGENTS и реальная телефонная приёмка.
Цель отмечается blocked, не complete и не paused. Реализация, артефакты и план
сохранены; новые ответы/разрешение позволят возобновить работу. Никакой публикации,
сброса ключей, изменений рабочей базы или рассылки не выполнялось.


Дополнительная проверка неизменённого опубликованного кандидата: [PWA-UPGRADE-1103.md](PWA-UPGRADE-1103.md). Точный переход прошлое→текущее превью одного version, реальный HTTP-обрыв/retry,220reused files,282149скачанных байт без повторной передачи паков; один reload, сохранённая партия/профиль и offline15игр: Chromium1/1PASS. Это не физический Home Screen или внешние сети. RoadMap361/work/readback. Runtime не менялся; новой сборки/публикации нет.
