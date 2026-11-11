> Исторический отчёт этапа. Актуальные статусы, изменения владельца и границы повторного использования evidence: [CURRENT-IMPLEMENTATION-1111.md](CURRENT-IMPLEMENTATION-1111.md), 11.11, preview.70. Старые PASS/OPEN ниже относятся к указанным в отчёте исходникам.

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

# Текущее превью: точечный HTML-разбор колонок

[FRAGMENT-PARSER-1104.md](FRAGMENT-PARSER-1104.md): опубликован HTML `b3f3c8f25729`, cache `f6a6c74b38a10caa`; companion/паки прежние. Настоящий Spider разбирает3колоночных фрагмента/17карт, а не весь tableau54карт. DOM regression Chrome/WebKit по1/1 сохраняет draft/caret/scroll17/WAAPI; skins обеих игр×2engine PASS, nativeSpider/Klondike PASS, ordinaryUNO/audience PASS. Build8SHA/3ZIP/source246, public4/4, live/offlineDomino/save/profile PASS. Внешний recipe/dirty signals/остальные игры/~100мс/fullGOAL остаются открытыми.

## История

# Текущее превью: регионы колонок пасьянсов

[SCENE-REGIONS-1104.md](SCENE-REGIONS-1104.md): опубликован HTML `c7bcd6644915`, cache `4f8f6a39e54000d5`, collection0.8.9-preview.4. Неизменённые tableau колонки повторно не строят SVG; настоящий Spider10изображений/54карты. Views22/22+undo/draw1/1, nativeSpider/Klondike по1/1Chrome; skin-after-command обеих игр1/1Chrome+1/1WebKit. Build8SHA/3ZIP/source246; public4/4; live activated/15games/protocol1; offline reload/coldPage/Domino/save/profile PASS. Внешний полный recipe/HTML-парсинг, остальные игры/physical/network/AT/usability остаются открытыми.

## История

# Текущее превью: стабильная активация паков

[PACK-ACTIVATION-1104.md](PACK-ACTIVATION-1104.md): опубликован HTML `8b9cad73c30c`, cache `67c23a167730e3f0`. Повторная активация неизменённого пака сохраняет registries; восстановление внешней замены/CSS/версий и rollback проверены (packs-reconcile4/4,view-contract11/11). ExactHTML Spider сохраняет renderer identity, move0→1, busyfalse/errors[]. Build8SHA/3ZIP/244source; public4/4; live activated/15games/protocol1/errors0. Полный renderer,~100мс,вся матрица игр/устройств/сетей/AT/usability остаются открытыми.

## История

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

# Текущий кандидат: доступ в комнату и крупный текст

`a13-final-1103/final`, standalone SHA256 `457b7d029ac34373320a3e7ba72a42330db0237ccde172d80d55392ea5d1baeb`, cache`b9b766a2d4e2976d`. [Изменения, проверки и ограничения](A13-ROOM-ACCESS-PREVIEW-1103.md). A13 Networkpermission/ownership/notification, truthfulrolecopy, общийtoggletext ицелыеSave/Cancel. Sourceunit1/1 и4UIcase×2engine PASS; exactHTML28states/engine,8SHA/3ZIP,230runtime+2locales/sourceZIP; Funnel443/8443+/hod обновлён,4publicbytes/liveactivated совпали. ДополнительныйRTCcase остановился наstale testselectorдоpermissionasserts, неPASS. ОбщийGOAL иphysical/реальныеонлайнцепочки/производительность/usability открыты.

## История

# Текущий кандидат: целые слова в оформлении

`appearance-text-final-1103/final`, standalone SHA256 `b802641906ca3a5a9c1452414a631522c93f5722e51261d90ae3f13f4aae25be`, cache`11569a4aeb5b498f`. [Изменения и проверенный scope](APPEARANCE-TEXT-REFLOW-1103.md). Колонки, кнопки и общий заголовок адаптируются к крупному тексту без разрыва слов. Native/controlled typography12states/engine, common geometry32records/engine; exactHTML70states/engine;8SHA/3ZIP,230runtime+2locales/sourceZIP. Временный Funnel443/8443+/hod обновлён,4publicbytechecks/live activated worker совпали. Серверные4SQL уже применены,19/19. Полный GOAL и physical/Push/RTC/AT/human usability остаются открытыми.

## История

# Текущий кандидат: правила, общие оси и reflow текста

`rules-reflow-type-1103/final`, standalone SHA256 `7aa60d952b9d68df579209751206568b0b299906500a2472969b42bd0333d503`, cache`6c3fc9fff2fa5ba1`. [Изменения и точные границы](RULES-REFLOW-AND-TYPE-1103.md). Исправлены A08 save validation, header gutter/toolbar clip, text2× catalog и nav/Room/badges с целыми словами; правила host-handoff проверены локальным lifecycle. ExactHTML70состояний/движок,8SHA/3ZIP CRC,230runtime/sourceZIP+2canonical locales. Полная временная PWA15игр обновлена в Funnel443/8443+/hod-021.html;4publicbytes и live activated worker/cache совпали. Общий GOAL и physical/AT/realRTC/Push/usability остаются открытыми.

Рабочий сервер того же проекта обновлён четырьмя явно одобренными SQL: [LIVE-SERVER-ROLLOUT-1103.md](LIVE-SERVER-ROLLOUT-1103.md). Postflight19/19,10routine hashes, новые RLS/ACL и сохранность operational settings подтверждены. Клиент7aa60d95…d0333d503/cache6c3fc9fff2fa5ba1 прежний; provider delivery и physical приёмка отдельно.

## История

# Текущий кандидат: общая ревизия, каталог и touch-фокус

`final-review-1103/final`, standalone SHA256 `883dd1240a535ace3dc8e525c82787d16244182d7f0ccc892418d9b1c268b8b0`, cache`dbef4de366a3d294`. [Изменения, проверенный scope и остатки](FINAL-REVIEW-1103.md). Полная временная PWA15игр обновлена в Funnel443/8443 и /hod-021.html.8SHA/3ZIP CRC,230runtime/sourceZIP+2canonical locales; exactHTML70состояний/движок.4public bytechecks и live activated worker/buildIdentity совпали. UI touch скрывает только декоративный фокус, игровые выделения сохраняются; mouse/Tab возвращают обводку. Общий GOAL и physical/AT/Push/usability остаются открытыми.

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

# Текущий кандидат: одно сохранение правил

`rules-atomic/final`, standalone SHA256 `0e1d657bc46f34391935c44a68944c6e43de7e7180c5ea5c4cae67b990796a96`. Временный Funnel443/8443 и /hod-021.html обновлены, worker activated/cache68bb03e1f761ff89. [Изменение, проверки и границы](RULES-ATOMIC-SAVE-1103.md). Более поздний аудит web.dev ведётся отдельно и ещё не включён в эту сборку.

## История

# Текущий кандидат: возврат на один уровень

Новый кандидат — `phone-back-1103/final`, SHA256 `71c0e9b37ba39d9fa44357226a7aa1f7c385c1ae7e43af0de8cf7cd13c0cd644`. Полная PWA обновлена в Funnel443/8443 и `/hod-021.html`; новый worker activated/cache77db4288e0ca1ed1. [Изменения, адресные проверки и ограничения](ACCOUNT-BACK-AND-OUTSIDE-1103.md). Предыдущая телефонная ревизия включена;6account sourcePASS и20состояний exactHTML/движок,8SHA/3ZIP CRC,230runtime/source ZIP и manifest совпали. Общий GOAL остаётся незавершённым; физическая/usability/Push/server приёмка отдельно.

## История предыдущих срезов

# Текущий кандидат: акцент, карточки и установка

[Standalone HTML](../../../tmp_files/ux-021/phone-polish-1103/final/playroom-all-games.html), SHA256 `5ee6ecfd8bbc0b6e7b4806b3b71fa2ea94a6c01dbf08cc7ac345448d86354e35`. Полная PWA с15играми опубликована в существующем Funnel443/8443; /hod-021.html также обновлён. [Изменения, проверки и ограничения](PHONE-POLISH-1103.md). Новый cache0a94f474945aa30c активирован; публичные байты совпадают.

## История

# Текущий кандидат: общий одноразовый вход поверхностей

[Standalone HTML](../../../tmp_files/ux-021/nonmodal-entry/final/playroom-all-games.html), SHA256 `60f744e2a2dee617bc38dc2fb8ee1a7a1ee4afaacc3caea2925c867df98712ac`.
Полная PWA с15играми обновлена в существующем Funnel443/8443 по ранее данному разрешению. [Результаты и границы](NONMODAL-ENTRY-LIFECYCLE.md); [общие исполнения](COMPONENT-STANDARDS.md); [проверка владельцем](OWNER-ACCEPTANCE.md). 8source browser cases+8unit; exactHTML24состояния/движок с normal motion; живой новый кеш/публичные bytes подтверждены. Предыдущие кандидаты сохранены ниже.

## История

# Текущий кандидат: ревизия2 телефонной проверки 3 ноября

[Standalone HTML](../../../tmp_files/ux-021/phone-review-1103/revision2/final/playroom-all-games.html), SHA256 `1632e19c51c9f140cd2ec8c8e53343bd2def05308c51e8df88f2d8de9e456494`.
Полная PWA с15играми обновлена в корне Funnel443/8443 в пределах ранее явного разрешения. Проверки, стандарты и ограничения — [PHONE-REVIEW-1103-REVISION2.md](PHONE-REVIEW-1103-REVISION2.md), [COMPONENT-STANDARDS.md](COMPONENT-STANDARDS.md). Предыдущие кандидаты сохранены. Это временное превью; реальная доставка Push и физическая приёмка ещё не завершены.

## История

# Актуальный кандидат: телефонная проверка 3 ноября

[Standalone HTML](../../../tmp_files/ux-021/phone-review-1103/final/playroom-all-games.html), SHA256 `11d181742471cdac0050f1e5ce5ee583ada98ecb43ae218af7dc1130615be739`.
Полная PWA с15 играми опубликована в корне Funnel по явному разрешению владельца. Это временное превью, не выпуск в штатных Pages/Cloudflare каналах. Подробности и границы: [PHONE-REVIEW-1103.md](PHONE-REVIEW-1103.md).

## История кандидатов

## Последнее уточнение меню и фильтров, 02.11.2026

Текущий HTML: `tmp_files/ux-021/owner-iteration03/menu-filters-final/playroom-all-games.html`.
SHA256 `1b574082523d826cb40cbb7597595590eb75581cdcc4bcbfe0017b401dad9fb4`.
От final-reviewed изменены только список меню партии (без disclosure), удалены неиспользуемые стили disclosure, убран формат 3+ и Командами перенесён перед 2+. Версии приложения и паков прежние. Выбранный walkthrough готового HTML: Chromium30 снимков и WebKit30, failures/errors пусты, nativeSupabaseRequests0; catalog проверяет точный порядок семи форматов, game — один nav без details/summary. Проверены также открытие правил, лобби, подтверждение остановки и возврат. Build exit0, 8 SHA и 3 ZIP CRC корректны. Остальные проверки предыдущего кандидата не повторялись. Публикации не было.

# Текущий локальный кандидат ревизии03

Приложение0.21.0-preview.1, коллекция0.8.9-preview.3 (Mage0.2.7-preview.3).
[HTML со всеми15играми](../../../tmp_files/ux-021/owner-iteration03/final-reviewed/playroom-all-games.html).
SHA256 `290cf8de98fa41cc1dab503c4b123677157e4d3909246a4c81705a123292ded1`.

Canonical build exit0,8SHA и3ZIP CRC корректны. На этом точном HTML:
Chromium/WebKit по80core+18social состояний, actual Mage case по1/1, без page
errors/nativeSupabase requests. Detailed source/hold/offline boundaries —
[приёмка03](OWNER-ITERATION-03-ACCEPTANCE.md). Source state и команды находятся
рядом с артефактами; сборка dirty workspace не выдаётся за чистый commit.

Полный экран только на экранах; последние названия/порядок, фильтры-иконки,
центровка звезды и компактные карточки уже включены. Предыдущие final-build и
final-compact сохранены как история, для просмотра использовать final-reviewed.
Ни публикации, ни production SQL, ни объявления об обновлении не выполнялось.

## История предыдущих кандидатов

## Предыдущий кандидат до ревизии03

Приложение0.21.0-preview.1, коллекция0.8.9-preview.2, 02.11.2026.
[HTML со всеми15играми](../../../tmp_files/ux-021/review-03-cleanup/playroom-all-games.html).
SHA256: `fbb0ce7dbaa366bc2542a0ce2918cc7e6d8af18ff096e4a86d098ac0810d1ee1`.

Относительно review-03-ownership удалён только невызываемый legacy
`cycleRoomSeat` из app.js. До удаления были только declaration/self-recursion,
внешних вызовов не было. Точное вычитание функции из предыдущего source ZIP
совпадает с текущим app.js; остальные188runtime файлов имеют прежние хеши.
Новый выбор мест остаётся единственной реализацией.

Node syntax check и canonical build прошли; все8SHA256SUMS и3ZIP CRC корректны.
Source state — review-03-cleanup/source-state.json. Неизменённые адресные
Chromium/WebKit checks не повторялись: их scope/provenance сохранён в
CONFIRMATION-OWNERSHIP-ACCEPTANCE.md и LATE-ROOM-CLOSE-ACCEPTANCE.md.
Публикация, production SQL и рассылка не выполнялись. Для завершения общей цели
остаются пользовательская и физическая приёмка и отдельно разрешённая выкладка.

## История

### Предыдущий кандидат после A36

Приложение0.21.0-preview.1, коллекция0.8.9-preview.2, 02.11.2026.
[HTML со всеми15играми](../../../tmp_files/ux-021/review-03-ownership/playroom-all-games.html).
SHA256: `78fd906163699e4fb1ef1b74fcb3808171ae3672e287210ae1785571b3bc1991`.

Canonical build exit0; все8SHA256SUMS и3ZIP CRC корректны. Runtime189файлов
сверен со source-state.json, drift0. Относительно touch-кандидата изменены только
app.js, network-ui.js и lobby-network.js: поздние kick/roster/freeze/close ACK.
Точные проверки — CONFIRMATION-OWNERSHIP-ACCEPTANCE.md (Chrome3/3+WebKit3/3)
и LATE-ROOM-CLOSE-ACCEPTANCE.md (Chrome1/1+WebKit1/1). Ведущий прочёл final
capture/release guards и сверил манифесты с текущими исходниками.

Геометрия/анимации из предыдущих кандидатов не объявляются новым прогоном
этого HTML; source delta и их точный scope сохранены ниже и в ROOT-MOTION-REVIEW.md.
Публикации, production SQL и рассылки не было. Реальные телефоны и приёмка
владельцем остаются открытыми. Предыдущие кандидаты сохранены.

# Предыдущий срез: анимации и касания

02.11.2026. После исправлений по последним замечаниям и ревизии анимаций:
[HTML со всеми 15 играми](../../../tmp_files/ux-021/review-02-touch/playroom-all-games.html).
Коллекция0.8.9-preview.2. SHA256 standalone HTML:
`fcd44791df76fd04a273fea82d5eb63bc333572a708485ec135ba9aa2db3cc49`.

Canonical build exit0; все8SHA256SUMS и3ZIP CRC прошли. Exact dirty source
state обоих репозиториев — `review-02-touch/source-state.json`.
Предыдущие кандидаты сохранены, включая промежуточный `review-02-motion` до
исправления native popover в WebKit; для просмотра использовать review-02-touch.

Границы доказательств: [ревизия анимаций](UI-MOTION-LIFECYCLE-ACCEPTANCE.md),
[проверка ведущего](ROOT-MOTION-REVIEW.md), [последние требования](OWNER-ITERATION-02.md).
Публикация, production SQL и рассылка не выполнялись. Проверки реальных
телефонов/системных возможностей остаются отдельной приёмкой.

## История предыдущих кандидатов

# Локальная сборка после сверки web.dev

02.11.2026. Это локальный кандидат интерфейса0.21; номер приложения0.20.1-preview.3 сохранён. Публикация, release tag, Push-рассылка и применение SQL не выполнялись.

Команда из playroom:

```sh
python3 build.py --all-games --pwa --remote-catalog --packs-dir ../playroom-paks/packs --output-dir ../tmp_files/ux-021/final-build
```

Exit0. Все8артефактов в SHA256SUMS проверены через `sha256sum -c SHA256SUMS` (exit0). В составе: приложение, standalone HTML со всеми15играми, исходники, core, PWA-архив/каталог и существующие SQL-артефакты. Генерация SQL не означает выполнение миграций.

Точный dirty source state обоих репозиториев, branch/HEAD и hash затронутых ключевых runtime modules: tmp_files/ux-021/final-build/source-state.json. Это сборка текущего рабочего дерева, а не чистого коммита. Соседние изменения сохранены; исходные packs взяты из playroom-paks/packs, не из исторического dist. SHA256SUMS относится к8выходамсборки; source-state.json — отдельное свидетельство, добавленное после сборки.

Выбранные проверки: установка и контекст уведомлений по1/1 Chromium/WebKit; GroupAB/RTCdrawer→Group→Back по1/1 обоими; A22/A24 по1/1 обоими с точной provenance в GROUP-CHAT-OWNERSHIP-REVIEW.md. Ведущий повторил9social×2ориентации после freeze:18кадров без ошибок/внешнихSupabase-запросов и изменения наблюдаемых источников. Полный набор не запускался.

Физическая установка на телефоны, OSmenu/keyboard/permissions, реальные внешние соединения/Push, production headers/HTTPS и публикация — отдельные незавершённые стадии. См. WEB-DEV-AUDIT.md, ACCEPTANCE-MATRIX.md и ROOT-FINAL-REVIEW.md.

## Уточнение после completion audit

Кандидат пересобран после реальных fullscreen/tutorial изменений и исправления
SQL-упаковки. Все8SHA256SUMS снова прошли; setup/check SHA совпадают с
SERVER-ROLLOUT-MANIFEST.md. Прежние артефакты сохранены в
tmp_files/ux-021/final-build-before-completion, не перезаписаны как опубликованные.

Добавленные адресные доказательства: fallback-fullscreen по1/1 обоими с4states
наengine и settled active content; Tutorial ownership по1/1 обоими с actualRED;
handoff→back→nativebot→durablefinished/result→sameLobby spectator/table
Chrome2/2+WK2/2 (TicTacToe); existing isolatedPG setup/check1/1 с negativeguards.
Подробности — FULLSCREEN-CURRENT-ACCEPTANCE.md, TUTORIAL-OWNERSHIP-ACCEPTANCE.md,
HANDOFF-COMPLETION-ACCEPTANCE.md и SERVER-ROLLOUT-MANIFEST.md.
Незатронутые прежние greens не повторялись. Общая цель остаётся active: physical,
production и пользовательская приёмка не подменяются локальными доказательствами.


Дополнительная проверка неизменённого опубликованного кандидата: [PWA-UPGRADE-1103.md](PWA-UPGRADE-1103.md). Точный переход прошлое→текущее превью одного version, реальный HTTP-обрыв/retry,220reused files,282149скачанных байт без повторной передачи паков; один reload, сохранённая партия/профиль и offline15игр: Chromium1/1PASS. Это не физический Home Screen или внешние сети. RoadMap361/work/readback. Runtime не менялся; новой сборки/публикации нет.
