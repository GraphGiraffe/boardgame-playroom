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

# Что проверено и что ещё не доказано — ХОД 0.21, 3 ноября 2026

Полностью подтверждённой работоспособности всех функций всех15игр пока нет. Наличие игры/обучения/звукового обработчика в сборке и зелёный общий компонент не заменяют полный пользовательский проход конкретной игры. Ниже — аудит имеющихся свидетельств и текущего кода; новых игровых/performance прогонов в этой ревизии не запускалось.

Текущее опубликованное превью: [PWA](https://seth.tail6aebd4.ts.net/), app0.21.0-preview.1 / collection0.8.9-preview.3, standalone457b7d02…a5d1baeb, cacheb9b766a2d4e2976d. [Сборка и фактические проверки A13](A13-ROOM-ACCESS-PREVIEW-1103.md).28адресных состояний/engine относятся к оболочке/A13, не к полному игровому покрытию.

| Область | Что есть в evidence | Что не подтверждено |
|---|---|---|
| Игровой звук | Реальный WebAudio first-touch запуск Yatzy roll и Klondike start/mute, сохранённые Chrome/WebKit кейсы; семантические unit-проверки. | Все звуковые события каждой из15игр, полное соответствие анимациям, реальная слышимость/громкость на телефоне, OS silent/background. |
| Звук меню | Универсального звука открытия/закрытия меню, перехода по навигации, каждого клика и обычного toast сейчас нет. | Эти события нельзя называть уже озвученными. Следует отдельно выбрать полезные сигналы, не превращая каждое нажатие в шум. |
| Сообщения/приглашения/уведомления | В коде подключены13семантических cues: start/message/reaction/invite/friends/handoff/connection/error/update и варианты. Есть mute/dedup/firstgesture проверки. | Native browser audio evidence не проходило реальные входящие сообщения/приглашения во всех состояниях. Наличие binding не доказывает слышимость. Системный Push управляется ОС/браузером и физически не принят. |
| Игровые анимации | Есть адресные motion/capture/cleanup/cancel/settings проверки и игровые lifecycle кейсы. Геометрия15паков проверялась отдельно. | Вся последовательность каждого игрового действия/исхода/отмены/истории/поворота во всех15играх. Общий UI-motion8/8 не является тестом всех игровых анимаций. |
| Перетаскивание | Есть сохранённый native CDP touch для Domino local/RTC и Chrome UNO gesture13/13; соседний WebKit GREEN относится к меню и не подтверждает паритет игровых UNO-жестов; также лобби/жетон первого игрока, контролируемые pointer/hold/scroll/cancel проверки. | Такого же актуального native per-game свидетельства для остальных13игр нет. Это не означает, что во всех играх должен быть drag: ожидаемый жест определяется механикой. Физическая рука/прокрутка/снятие выбора и многопальцевые ситуации остаются отдельной приёмкой. |
| Обучение | Все15паков содержат tutorial.js. Исторический artifact case PASS6/6 охватывает13multiplayer host+guest. | В том case не более5доступных шагов и хотя бы1learned goal; полный сценарий до завершения не доказан. Klondike/Spider из этого case исключены. Нужны полное обучение, выход/возврат, повторное открытие и продолжение обычной игры. |
| Боты и зависания | Причины остановки Ludo под меню и UNO accusation/deadline исправлялись и проверялись адресно. Есть единичные сохранённые дедлайны UNO3004/3028ms при намеренных3000ms. | Все игры/сложности/составы, длинные партии, сеть/reconnect/host handoff, OS background/foreground и любые promises. Нельзя утверждать отсутствие зависаний вообще. |
| Производительность | Есть отдельные исторические capture/apply/serialize измерения. | Для текущего457b нет профиля CPU/FPS/long tasks/времени botAction/input latency. Старый engine apply benchmark исключает поиск бота; он не доказывает плавность интерфейса. |

Звук намеренно подавляется в некоторых контекстах: уже открытый разговор/своя комната, устаревшее приглашение, скрытая/неактивная страница, mute/busy/короткая защита от дублей. Это нужно проверять отдельно от потерянного первого звука: отсутствие сигнала может соответствовать политике, а может быть ошибкой конкретного пути.

## Что проверять следующим и как не подменять результат

Приоритет уточнён 04.11: исторический смешанный Mage RED разобран в [адресном отчёте](MAGE-EFFECTS-1104.md); все отдельные цели обоих пасьянсов проверены в [новом сценарии](SOLITAIRE-LEARNING-1104.md). Это ограниченные результаты на своих source/artifact, не полная приёмка игр. Далее нужны default-варианты, самостоятельная навигация к offscreen цели и механики остальных игр из [матрицы 15×4](../../../tmp_files/ux-021/coverage-audit-1103/games.md).

1. **Сквозные игровые действия на одной зафиксированной сборке.** Для каждой игры — ожидаемые именно ей tap/drag/hold/scroll/cancel и полный доступный tutorial, затем обычный ход/бот/результат. Для карточных рук отдельно сравнить tap с удержанием и прокруткой, снять предвыбор другой картой/пустым местом. Проверять обе ориентации, reduced motion и размер текста там, где они меняют поведение; не запускать искусственное декартово произведение всех параметров.
2. **Звуковая цепочка.** Новый запуск→первый разрешённый touch→старт/ход; входящее сообщение/приглашение/реакция/передача хоста/обновление; активный/другой разговор, mute/громкость, foreground/background, повтор события. Для браузера фиксировать AudioContext/запланированный source/уровень gain; для физического устройства дополнительно подтвердить, что звук действительно слышен и различим. Меню сейчас не входит в реализованные универсальные cues.
3. **Измерить тяжёлые пути, затем оптимизировать конкретное узкое место.** Существующие Ludo modal-bot, UNO deadline и большой карточный transfer; один сложный ход бота. Chrome DevTools/CDP и штатные PerformanceObserver/RAF: разделить botAction, act/reduce, projection, capture/plan, render/layout/paint; снять p50/p95/max/long tasks и условия CPU/device. Forced-GC retained-scene тест измеряет утечки, а не FPS. Нужны отдельные desktop/WebKit/физический слабый телефон результаты.
4. **Длительная жизнь и сеть.** Серия ходов с меню/чатом/сменой ориентации, сворачивание/возврат, повторный вход/история и восстановление; два-три участника, delayed ACK, потеря сети и handoff. Дополнительный current UNO RTC кейс пока RED на устаревшем `.modal` селекторе до проверки разрешений; он не включён в PASS.

## Подробные источники и границы

- [Игры: матрица имеющихся свидетельств](../../../tmp_files/ux-021/coverage-audit-1103/games.md).
- [UI audio: bindings, mute/dedup и реальный native scope](../../../tmp_files/ux-021/coverage-audit-1103/ui-audio.md).
- [Производительность/боты: измерения, их возраст и непокрытые риски](../../../tmp_files/ux-021/coverage-audit-1103/performance-lifecycle.md).

Эти три отчёта различают исходники, выполненные кейсы, исторические данные и физическую приёмку. Current hashes сверены отдельно; старый PASS не переименован в новый full-preview run. Выявленные непокрытые риски не объявлены воспроизведёнными дефектами. Общая цель остаётся в работе.
