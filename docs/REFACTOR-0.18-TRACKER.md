# Реестр переноса 0.18

[Утверждённый план](AUDIT-0.18.md) · [границы контрактов](REFACTOR-0.18-CONTRACTS.md).

Состояние на 2026-10-16: реализован кандидат **0.18.0-rc.5 / 0.7.0-rc.4**. Базовая миграция всех 12 игр и общих механизмов вошла в RC1; RC2–RC4 содержат исправления приёмки и согласованные дополнения. Актуальные проверки — [RC4](RC-0.18.0-rc.4.md), [RC5](RC-0.18.0-rc.5.md), публикация и продолжение — [HANDOFF](HANDOFF-0.18.md). Production остаётся 0.17.6 / 0.6.5. Исторические сведения ниже не заменяют текущее состояние.

Старые разделы ниже сохраняют хронологию; их пометки «впереди» относятся к соответствующему срезу. Текущие владельцы и границы описаны в SDK и разделе «Заключительный срез».

| ID | Функция / владелец сейчас | Проверка / свидетельство для переноса | Состояние |
| --- | --- | --- | --- |
| F01 | Hub: категории, порядок, скрытие, избранное — app/app.js, pack-manager | rc2-hub-browser, pack-update-notice-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F02 | Фильтры/последняя игра/версия — app/app.js | rc2-hub-browser, ui | Реализовано; покрыто совместным прогоном и точечными повторами |
| F03 | Установка, версии, quarantine — core/packs.js, pack-manager | view-contract, packs-reconcile | Реализовано; покрыто совместным прогоном и точечными повторами |
| F04 | Каталог/скачивание/SHA — remote-catalog, pack route | packs-reconcile, pwa | Реализовано; покрыто совместным прогоном и точечными повторами |
| F05 | Удаление одного/старых/всех паков и зависимых партий | rc2-games, ui; отказ сетевого архива отдельно | Реализовано; покрыто совместным прогоном и точечными повторами |
| F06 | Локальные сохранения/полная очистка/паки остаются | session, history-library-layout-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F07 | Профиль/имя/роль/место/бот — multiplayer | player-profile, multiplayer-lobby | Реализовано; покрыто совместным прогоном и точечными повторами |
| F08 | Команды/первый игрок/готовность/отсчёт/правила | multiplayer-lobby, ludo-team-markers-browser, lobby-layout-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F09 | Hotseat/закрытая рука/передача/пауза/продолжение | ui, quick-play, unified-game-screen-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F10 | Детерминизм seed/shuffle/dice — engine | engine + domain-foundation | Реализовано; покрыто совместным прогоном и точечными повторами |
| F11 | Колода 36/52/54 и исключение Акулины — 4 rules.js | domain-foundation + rc2-games | Реализовано; покрыто совместным прогоном и точечными повторами |
| F12 | Legal/apply/validate/projection — engine + 12 паков | engine, rc2-games, view-contract, core/model | Реализовано; покрыто совместным прогоном и точечными повторами |
| F13 | Prepare/durable commit/ACK/retry — authority/session/store | authority, durable-authority, network-store-integrity, network/table | Реализовано; покрыто совместным прогоном и точечными повторами |
| F14 | Скрытые данные игрока/зрителя/стола | core/model, rc2-games, authority | Реализовано; покрыто совместным прогоном и точечными повторами |
| F15 | Room: замена ботом/возврат/следующая партия | network-resume, network-next-match, multiplayer-lobby | Реализовано; покрыто совместным прогоном и точечными повторами |
| F16 | Текст/QR/камера/share — pairing/PWA/scanner | pairing, qr-pairing-browser, pairing-methods-browser, pwa-share | Реализовано; покрыто совместным прогоном и точечными повторами |
| F17 | Звуковое подключение/ручной адрес/отмена | acoustic-pairing, acoustic-webrtc-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F18 | WebRTC/presence/ошибки/восстановление | webrtc-transport, presence-transport, network-reconnect-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F19 | Хостовый журнал/lock/reload | host-recovery, network-session-store-browser, network-host-recovery-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F20 | Клиентский архив/backfill/read marker | network-client-history, network-client-history-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F21 | Replay/scrub/return/новый участок | history-library-layout-browser, network-client-history-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F22 | Source/target/адресат/выбор карты | drag, player-target, uno-drag | Реализовано; покрыто совместным прогоном и точечными повторами |
| F23 | Ship drag/move/rotate/outside/цельный контур | rc2-games-browser + rc2-games | Реализовано; покрыто совместным прогоном и точечными повторами |
| F24 | Устойчивый scroll/pointer/focus | hand-navigation, hand-overflow-browser, mobile-navigation | Реализовано; покрыто совместным прогоном и точечными повторами |
| F25 | Motion/flip/roll/очередь/minimum wait | game-flow, motion-effects, motion-settings, network-feedback-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F26 | Баблы/адресат/success/error — game-feedback | game-feedback, uno-feedback, network-feedback-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F27 | UNO окна/пауза/сеть/повтор/штраф | uno-reactions, uno-social, authority | Реализовано; покрыто совместным прогоном и точечными повторами |
| F28 | Звук/темп/reduced-motion/мой ход | game-flow, game-feedback, motion-settings | Реализовано; покрыто совместным прогоном и точечными повторами |
| F29 | Карточки/счётчики/знаки/команды | game-screen, first-medallion-browser, ludo-team-markers-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F30 | Результаты/показатели/места/аватар | result-team-medallions-browser, game-screen, rc2-games | Реализовано; покрыто совместным прогоном и точечными повторами |
| F31 | Все семьи ассетов/масштаб/веер/стопка | artwork, first-medallion-browser, result-team-medallions-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F32 | PWA/offline/update/несколько окон | pwa, pwa-share, rc2-hub-browser | Реализовано; покрыто совместным прогоном и точечными повторами |
| F33 | Themes/skins/editor/toolbar | appearance model + Web adapter + native editor/picker; ui/appearance | Реализовано; покрыто совместным прогоном и точечными повторами |
| F34 | Locales/key/params/plural/aria/fallback | Translator + ru common/themes + Крестики-нолики: metadata/rules/actions/events/aria | Реализовано; покрыто совместным прогоном и точечными повторами |
| F35 | Автономный HTML/PWA/пак/архив/SHA | build.py обоих репозиториев, standalone check, pwa | Реализовано; покрыто совместным прогоном и точечными повторами |

## Состояние паков

| Пак | Особенности, которые нельзя потерять | Перенос |
| --- | --- | --- |
| ludo | 1–3 dice/exit/guarantee/safe/capture/team help/stack/finish triangle | API 3 / 0.2.0; domain/board/scene/locales; общая геометрия правил и предпросмотра |
| battleship | russian/classic/setup/manual/auto/ready/ship drag/observer follow | Domain/геометрия/scene/locales; API 3 / 0.2.0; публичные выстрелы, приватная расстановка |
| yatzy | 15 categories/3 rolls/hold/release/upper bonus/scroll | Независимая модель/схема/scene/locales, API 3 / 0.2.0; выбранные проверки прошли |
| pexeso | 36/52/54/reveal/flip/close/seen/mismatch/turn | Domain/scene/locales; API 3 / 0.2.0; отдельная память бота |
| gofish | 36/52/54/books/ask/response/repeat/empty stock | API 3 / 0.2.0; domain/scene/locales; публичные сообщения, приватные choices |
| oldmaid | 35/54/53/pairs/hidden draw/out order/points | API 3 / 0.2.0; stateVersion 4 с points; публичный слепой draw, приватные руки |
| durak | 3 variants/decks/jokers/compose/undo/transfer/limits/refill | API 3 / 0.5.0; domain/cards/game/scene/locales; составной заход, переводы и скрытая раздача |
| uno | 108 cards/color/penalty/manual-auto/declarations/protection | API 3 / 0.5.0 / stateVersion 2; domain/scene/locales; реакции/окна/эпизоды и приватная рука |
| checkers | forced chain/king/promotion/deferred capture/draw | API 3 / 0.4.0; domain/board/scene/locales; семантический capture вместо разбора подписи |
| domino | endpoints/orientation/stock/pass/fish/score/long chain | API 3 / 0.4.0; domain/scene/locales; явный ascending result и начисление очков |
| snakes | 64/100/bounce/link once/same-cell pawns/die | API 3 / 0.4.0; domain/scene/locales, переносимая motion route |
| tictactoe | assigned first/X-O/win/draw/bot/public | Domain/scene/locales/Web разделены, engineApi 3, версия 0.2.0 в разработке |

## Проверенный первый срез

- `node scripts/codex/test.cjs case/domain-foundation,case/engine,case/rc2-games` — 64/64.
- `node scripts/codex/test.cjs case/views,case/session` — 37/37.
- `node scripts/codex/test.cjs case/artwork` — 2/2; изолированный Chrome.
- Companion `bash scripts/codex/check.sh` — синтаксис, 12 автономных паков, SHA 15 артефактов.
- `python3 build.py --pwa --all-games --packs-dir ../playroom-paks/packs --output-dir dist/refactor-0.18` и `sha256sum -c SHA256SUMS` в выходном каталоге — 5 артефактов verified.
- В готовом автономном HTML: 12 зарегистрированных игр, создание/валидация/доступные действия 4 карточных игр, RNG загружен, page errors 0. PWA document/worker ссылаются на один хешированный RNG asset.

Это приёмка извлечения RNG/колоды и подключения сборки. Полная приёмка 0.18, themes/locales UI и network/layout всех сценариев не выполнялась. Первоначальные ошибки загрузки VM и пути сборщика исправлены; перечисленные результаты относятся к исправленному коду. Артефакты разработческие, не опубликованы под прежними версиями.

Второй срез: `core/appearance,core/localization` — 16/16. Независимые модели и JSON каталоги; Web-подключение добавлено третьим срезом. Сохранение плана в удалённой dev подтверждено PR #116 (squash 27988f7). Разрешение владельца распространяется на коммиты, push, PR, релизы и деплой по обычным правилам проекта.


## Третий срез: оформление в Web UI

Редактор/переключатель тем подключён к локальному сервису; фиксирует 54 слот палитры. Навигация сохраняет справку в верхней панели. Ни игровая команда, ни перезапись сохранения, ни remount сцены при переключении не требуются. Детали и границы — [контракты](REFACTOR-0.18-CONTRACTS.md#третий-срез-web-адаптер-и-редактор-оформления).

Проверки выполняются выбранными сценариями, без полного цикла правил/сети. Фактические команды и результаты третьего среза:

- `core/appearance,core/localization,case/game-screen` — 23/23.
- `case/rc2-games-browser` — 2/2 (геометрия сцен и устойчивость таблицы).
- `case/rc2-hub-browser,case/unified-game-screen-browser` — 5/5.
- `ui/appearance,case/mobile-navigation` — 15/15, включая подслучаи навигации на шести viewport; прежнее ожидание боковой справки обновлено под согласованный редактор.
- `case/result-team-medallions-browser,case/pack-update-notice-browser` — 2/2; медали сохраняют различие цветов и компоновку при смене темы, непрочитанные обновления сохраняют состояние.
- Финальный совместный запуск перечисленных узких selectors: 47/47, fail/skipped 0.
- Выбранная проверка `built PWA uses content-addressed` из `tests/pwa.test.cjs` — passed; новые runtime/CSS присутствуют в index, SW и integrity manifest под хешированными именами.
- Сборка `python3 build.py --pwa --all-games --packs-dir ../playroom-paks/packs --output-dir dist/refactor-0.18-appearance` и `sha256sum -c SHA256SUMS` — 5/5.
- Companion `bash scripts/codex/check.sh` — 41 JS, 12 автономных паков, SHA 15 файлов.
- Автономный HTML в Chrome без HTTP/CDN: 12 игр, dark picker, editor с 54 цветом, page errors 0.

Кадры разработческой проверки: `tmp_files/refactor-0.18-appearance/` (игнорируются Git). Обнаруженные при работе ошибки приоритета CSS на 320 px, старых hub overrides и светлых sticky cells Ятзи исправлены. Это приёмка данного среза; общий реестр F01–F35 и полный переход 0.18 ещё не закрыты. Release/Actions/deploy не запускались, публичная пара остаётся 0.17.6 / 0.6.5.


## Четвёртый срез: независимая модель и эталонный пак

Введён GameModel с immutable Position/ActionChoice/Transition/Projection/Result; события фильтруются до presentation. Крестики-нолики 0.2.0 перенесены на domain/presentation/locales/Web, engineApi 3. Существующий Session пока подключён временным app/model-adapter.js; staging, remote catalog, public projections и автономные builders учитывают новый API. Подробности и незакрытые границы — [контракты](REFACTOR-0.18-CONTRACTS.md#четвёртый-срез-независимые-правила-события-проекции-и-сцена).

Решение владельца о Столе зафиксировано в MULTIVIEW.md: видимость Зрителя + явно публичные действия. Публичные кубики видны, закрытые руки рубашками/открытые лицами, обе расстановки Морского боя скрыты. Actor не повышает viewer. Сетевые role/actor binding/receipts/history и контроллер Стола остаются следующим этапом; обычный spectator connection read-only.

Выбраны проверки по затронутым модулям, полный цикл и Actions не запускались:

- `core/model,case/engine,case/session,case/view-contract,case/rc2-games,case/authority` — 112/112; после дополнительного запрета приватных событий до presentation повторный `core/model` — 11/11.
- `case/rc2-games,case/packs-reconcile,case/domain-foundation,case/durable-authority,case/views` — 56/56; в том числе обе скрытые расстановки Морского боя на Столе при openHands=false/true.
- `case/rc2-games-browser,ui/appearance` — 6/6: 320/390/740 px, light/dark, X назначенного первого игрока, public Table commands, spectator/replay read-only, реальный projected client через authority/transport и история.
- В core/model проверяется весь достижимый граф независимым bitboard oracle: по 5478 позиций и 16167 переходов для каждого назначения первого игрока; immutable state, строгие команды, приватные события, бот, сохранение/повтор и равенство bundles двух builders.
- Выбранные `remote pack loader checks` и `built PWA uses content-addressed` — 2/2; runtime/адаптер в PWA cache и integrity manifest.
- `python3 build.py --pwa --all-games --packs-dir ../playroom-paks/packs --output-dir dist/refactor-0.18-model` + SHA256SUMS — 5/5.
- Companion standalone `bash scripts/codex/check.sh` — 12 паков, SHA 15 файлов.
- Финальный `layered model renders` в `tests/rc2-games-browser.test.cjs` — 1/1; кадры без перекрывающего стартового диалога сохранены в `tmp_files/refactor-0.18-model/`.
- Автономный HTML через file:// в Chrome: 12 игр, Крестики-нолики 0.2.0, X у назначенного первого игрока (индекс 1), 8 публичных команд после первого хода, dark theme, page errors 0.

Это разработческий срез, не завершение 0.18. Опубликованные 0.17.6 / 0.6.5 не изменены. Общая миграция Session/events/results/authority, оставшиеся 11 паков, все материалы AssetResolver и финальное удаление старых контрактов остаются в реестре.


## Пятый срез: сетевой Стол и единая привязка прав

Политика `application/session-access.js` используется при старте партии, для устройства хоста и при authenticated resume. Authority разделяет viewer/actor; grant Стола выдаёт только хост, интерфейс получает зрительские данные и явно публичные команды. Доставка и durable receipts используют существующий pipeline, но ACK/history сохраняют публичную проекцию. Новых схем БД и runtime зависимостей нет. Неперенесённые паки остаются без управления Стола.

Проверено выбранными сценариями:

- `network/table,case/authority,case/durable-authority,core/model` — 37/37: приватность, публичные кубики, запрет приватного выбора/ботов/подмены actor, read-only история, grants, duplicate/stale/collision, потеря ACK, восстановление квитанции, MessagePort async pipeline.
- `network/table,case/authority,case/durable-authority,case/network-resume,case/network-next-match,case/host-recovery,case/network-store-integrity,case/webrtc-transport` — 50/50.
- `case/network-main-app,case/network-session-store-browser` — 7/7: обычный WebRTC/UNO и новый Стол в трёх отдельных контекстах Chrome, публичные ходы Крестиков-ноликов с Table/телефона, архив без ввода; настоящая IndexedDB и reload с повторным ACK без нового хода.
- `case/network-reconnect-browser,case/network-host-recovery-browser` — 4/4: действующие сценарии восстановления соединения и комнаты не потеряны.
- `built PWA uses content-addressed` — 1/1; новый application-модуль попадает в PWA, получает хешированный URL и integrity. Обнаруженный пропуск каталога в сборке исправлен чтением entrypoint refs из index.html.
- `python3 build.py --pwa --all-games --packs-dir ../playroom-paks/packs --output-dir dist/refactor-0.18-table` и SHA256SUMS — 5/5.

Полный цикл/Actions/release/deploy не запускались. Физические устройства и внешние сети этим прогоном не проверены. Следующие этапы: canonical Session/events/CommandProcessor, полное представление results/metrics и перенос остальных 11 паков, включая их public actions/reactions. Временный адаптер и прежние форматы будут удалены при общем переходе; публикация остаётся 0.17.6 / 0.6.5.

## Шестой срез: независимые механизмы Session

History владеет последовательностью immutable ревизий, staging/invalidation/compaction. Codec владеет компактным JSON с прежними ограничениями импорта. Typed Events/ModelValues выделены из GameModel; Session связывает их с существующим engine через историю и принимает порт часов. Restore не создаёт игру заново. Контракты и незакрытые границы — [описание среза](REFACTOR-0.18-CONTRACTS.md#шестой-срез-история-сериализация-и-порт-часов-session).

Выбранные проверки, без полного цикла:

- `node scripts/codex/test.cjs core/model,core/session-runtime,case/session,case/authority,case/durable-authority,network/table,case/host-recovery,case/network-store-integrity` — **79/79**. Новый подблок содержит семь регрессий: независимое исполнение без платформы, immutable staging, stale/foreign/invalidation, атомарный отказ compaction, no-op, явные часы/их отказ и восстановление без create/чтения времени. Существующие проверки сохраняют приватность, exact packVersion и защиту импорта.
- `node scripts/codex/test.cjs case/engine,case/rc2-games,case/network-session-store-browser,case/network-host-recovery-browser,case/artwork` — **68/68**. Проверены правила/проекции действующих паков, реальная IndexedDB, reload и duplicate ACK Стола без второго хода, восстановление комнаты/приватного viewer хоста и браузерные таймеры authority.
- `node --test --test-name-pattern='built PWA uses content-addressed' tests/pwa.test.cjs` — **1/1**: новые entrypoints входят в hashed URLs/cache/integrity.
- Разработческая сборка: `python3 build.py --pwa --all-games --packs-dir ../playroom-paks/packs --output-dir dist/refactor-0.18-session`; файлы не публикуются под прежними версиями. SHA256SUMS — **5/5**. Готовый playroom-all-games.html через file:// в Chrome: новые модули загружены, ход Крестиков-ноликов и compact restore с явными часами прошли, page errors 0.

Этот срез не завершает Session/events/CommandProcessor и не меняет API/байты опубликованных паков. Полный pipeline приватных событий остаётся закрыт временным адаптером. Остальные 11 domain/presentation, общие metrics/results, AssetResolver и финальный переход ещё в плане. Actions/release/deploy не запускались; опубликованная пара 0.17.6 / 0.6.5 остаётся базой сравнения.


## Седьмой срез: processor, типизированный журнал, scheduler и Ятзи

Контракты — раздел седьмого среза REFACTOR-0.18-CONTRACTS.md. Основной выбранный прогон:
`core/model,core/localization,case/rc2-games,case/session,case/authority,case/durable-authority,network/table,case/game-flow` — **100/100**. Включены headless Ятзи с явным RNG, приватный факт без перевода до проекции/звук/повтор, вложенные MessageRef, отмена scheduler, bot-memory privacy и существующие сохранения/правила.

Отдельная браузерная регрессия `Yatzy keeps` — **1/1**, общий узел таблицы/scroll сохранён. Предыдущие ошибки нового HTTP entrypoint (presentation/scheduler не проходил whitelist fixture), пути перенесённого SDK и временного layout scroll исправлены. Неуспешные/прерванные прогоны не считаются приёмкой. Окончательные browser и packaging результаты этого среза записываются вместе с точной парой SHA в PR.

Остальная работа ведётся до полного выполнения AUDIT-0.18.md, без объявления этой части готовой 0.18. Старые опубликованные релизы не изменены.


## Восьмой срез: canonical token, library header и delta journal

- `core/domain,core/model,case/views,case/rc2-games,case/game-screen` — **69/69**: byte/digest parity shared token и host SDK, pure models и текущие правила/сцены.
- `core/session-runtime,case/network-store-integrity,case/session,case/durable-authority` — **45/45**: metadata list без restore, quota/stale deletion, delta storage линейного числа фактов, gap/tail rejection, durable receipts.
- `case/network-session-store-browser,case/network-host-recovery-browser,case/unified-game-screen-browser,case/network-feedback-browser,case/history-library-layout-browser` — **43/43**: IndexedDB/reload/retry, приватный viewer хоста, slider/focus, архив без новых ходов, эффекты/реакции и отсутствие прежнего сброса layout.
- Bootstrap fixtures явно загружают Protocol/Components/Scheduler; ранее выявленные ошибки зависимостей исправлены. Отдельные проверки истории 320 px и очереди rapid remote revisions — 1/1 каждая.

Эти результаты относятся к исходникам среза до чистого переноса IndexedDB adapter в platform/web; после переноса Node recovery/integrity/durable — 19/19. Итоговый browser/package bootstrap для нового пути фиксируется в PR перед commit. Полный финальный прогон и релиз 0.18 ещё впереди.


Финальная фиксация срезов 7–8: после переноса platform/web adapter выбранные Node группы дали **117/117** и **44/44**; реальные IndexedDB/recovery/artwork — **10/10**, ошибок/пропусков нет. PWA hashed shell — **1/1**. Сборка dist/refactor-0.18-services, SHA256SUMS **5/5**; извлечённый SDK ZIP действительно импортирует модели/processor/journal/recovery/scheduler и выполняет ход/compact restore с явными часами. Полный финальный набор 0.18 не запускался. Работа продолжается по оставшимся строкам реестра.


## Девятый срез: перенос Морского боя и Пексесо

- `core/model,case/rc2-games,case/views,case/game-screen,core/localization` — 73/73, fail/skipped 0.
- Новые проверки: headless VM без ambient RNG/часов/engine/DOM; публичные выстрелы за обоих игроков Стола; запрет доступа к расстановке; no-sinking privacy; память Пексесо отдельно от viewer projection.
- Прежний fixture бота Морского боя удалял флот и стал недопустимым по новой схеме; теперь он заменяет флот на другой корректный с сохранением наблюдённого попадания.
- Полный рефакторинг не завершён: остальные domain, контроллеры, полный каталог ассетов/текстов и cutover остаются в плане. Публикация не выполнялась.

- Браузерные `case/rc2-games-browser` — 3/3; `case/result-team-medallions-browser` — 1/1; `network/table` — 6/6. Исправлено дублирование панели полей в Table surface.
- `build.py --prepare-dev --all-games --packs-dir ../playroom-paks/packs` и SHA256SUMS — 4/4 разработческих артефакта.

## Десятый срез: десять независимых моделей и общий публичный результат

Перенесены Лудо, Змеи и лестницы, Акулина, Рыба, Домино, Шашки. Domain не читает engine/UI/имена/часы/ambient RNG; отдельные presentation/locales. Headless VM проверяет все десять моделей с заблокированными Math.random/Date.now и без TabletopCore/DOM/storage. Структурные паковые подписи/общие Web-компоненты ещё продолжают перенос, это не завершение всей локализации.

GameModel.start возвращает начальный Transition с фактами (комплекты при раздаче); create возвращает Position. Необязательный score задаёт текущие очки модели, включая выход Акулины и начисление Домино. Номер revision продвигается самим runtime. Choice metadata/capture и PlayerReference принадлежат presentation. Protocol.command выбирает только поля канонической команды по разрешённому modelProjection.actions.

Эффекты локальной игры, сети и replay читают уже разрешённые события. Сетевой snapshot передаёт публичные firstPlayer/firstPlayerMode/result, клиент результатов использует те же playerContent, что сцена.

Проверки:

- `core/model,case/engine,case/rc2-games` — 79/79.
- `case/authority,case/durable-authority,case/views,case/session` — 58/58.
- `case/rc2-games-browser,case/checkers-drag,case/domino-layout` — 25/25.
- `case/network-feedback-browser,case/result-team-medallions-browser` после исправления fixtures — 8/8.
- Минимальные позиции Домино (без полной колоды) теперь проверяют непосредственно чистые локальные правила; полная GameModel продолжает требовать все 28 костей. Privacy fixture использует настоящие ID, не ломает схему ради маркера. Проверка целостности не ослаблялась.

UNO/Дурак, общие screen/history/input/room controllers, все семейства AssetResolver, полный каталог приложения, единый compiler и окончательный cutover ещё не завершены. Публичные версии не изменены; releases/deploy/Actions не запускались.

- После разделения Table choices и canonical protocol: `case/model-contract,case/authority,case/durable-authority,network/table` — 37/37.


## Уточнение выпуска от владельца

После завершения всего рефакторинга и итоговой приёмки выпустить **PlayRoom 0.18-rc.1** (SemVer артефактов: `0.18.0-rc.1`) как предварительный релиз. Развернуть в отдельном **Cloudflare Pages preview**, адрес передать владельцу в чате. Стабильный production deploy и указатель каталога паков не переключать.

Для RC проверить независимые immutable версии приложения/паков, preview bindings и изоляцию каталога RC от production. До и после публикации сверить стабильный адрес и версии/контрольные суммы; preview должен использовать совместимую RC коллекцию. Полный финальный прогон — один раз явно перечисленными блоками на окончательной паре исходников; обычные текущие срезы продолжают проверяться точечно. Данный запрос заменяет production-публикацию на финальном этапе плана preview-публикацией RC; остальные критерии рефакторинга сохраняются.


## Одиннадцатый срез: независимый Дурак

Все варианты, размеры колод и завершения перенесены в чистую модель; правила карт и ролей отдельно от оформления/текстов. Domain сохраняет полную колоду и детерминированный RNG. Стол видит закрытые руки; карточные choices приватны, ответы «Беру»/«Бито» публичны. Составной заход/отмена/переводы/добор и роли не меняются. PlayerListReference форматирует участников в presentation.

Проверено: `case/rc2-games` — 28/28; после исправления старых fixtures `case/views,case/pack-models,case/model-contract` — 34/34. `case/rc2-games-browser` — 3/3. Compact-hand дополнительно проверяется после замены raw kind на semantic type в assertions: продуктовые события теперь типизированы, отображаемые подписи по-прежнему формирует presentation.

Итог среза 11: `case/compact-hand` — 35/35; `case/pack-models,case/model-contract` — 20/20, включая новый запрет приватных карточных действий Стола. Все subtests зелёные, пропусков нет.

## Дополнительный сценарий личного экрана со Столом

F36: только сетевая игра с подключённым Столом; личный режим player, фиксированные зоны и равные карточки. Кнопка заменяет историю; пауза всегда сверху. Все быстрые команды дублируются в настройках квадратами в два ряда. Проверено на 2/4/6 игроках, 320/390 px и landscape 740 px. Реализация среза 13 готова; финальная интеграция впереди.


## Двенадцатый срез: UNO и переносимые реакции

Все 12 паков имеют чистые domain, presentation, locale, Web renderer. UNO 0.5.0 / API 3 / stateVersion 2 сохраняет 108 карт, добор/штраф последней карты, ручной/автоматический UNO и независимые ситуации участников. Отсутствующее legacy UNO-state теперь отклоняется: новый формат требует явные ситуации. Искусственные неполные колоды unit tests проверяют чистый reducer; полная модель всегда требует 108 канонических карт.

GameModel объявляет reactions/reactionControl/reactionWindows/botReaction отдельно от обычного хода. Domain не читает часы и тип игрока; authority задаёт сроки и фильтрует окна ботов. Проекция Стола содержит публичные выкрики/обвинения, без карточных choices. Presentation переводит speech/notice/target metadata; опубликованные события не содержат готового текста. Исправлен host loader: manifest scope явно передаёт engineApi/stateVersion, не подменяет schema на 1.

Проверено: выбранные core engine/pack-models — 41/41; UNO rules/feedback/reactions включая 36 полных партий и сетевые сроки — 31/31 (в группе games 38/46 первоначальные 8 сбоев относились к view fixtures); затем `case/views,case/model-contract` — 27/27. Браузерные `case/uno-social,case/uno-drag,case/network-feedback-browser` — 32/32. Пропусков нет. Общие controllers/assets/compiler/locales/cutover и итоговая приёмка RC остаются впереди.


## Тринадцатый срез: общая жизнь экрана и личный режим со Столом

application/HistoryController владеет курсором/запросом/ticket, проверкой аудитории/ревизии, received/presented/reviewed и границей backfill. Обычное листание само не создаёт маркер. GameScreenController владеет контекстом viewState/selection, отменой presentation lifecycle и последовательной очередью с загрузкой пропущенных ревизий. Локальный commit подключён через client port и общий transition; сеть/архив используют тот же context/history/queue. Hotseat gate и транспорт остаются адаптерами политики. DOM patch теперь одинаков для live/replay, slider больше не требует отдельной разрушающей замены сцены.

Сетевой player-режим доступен только при присутствии подключённого Стола и поддержке поверхности пака. Это локальная preference, правила/история/другие клиенты не меняются. Фиксированные области карточек и своей руки; равная сетка соперников, около 1/3 под руку в portrait и боковая зона в landscape/desktop. При отключении Стола поле возвращается. На локальном/hotseat экране кнопки нет. Пауза остаётся сверху, переключатель занимает историю. Одна декларация toolbar используется для двухрядных квадратных shortcuts настроек, включая скрытую в toolbar историю.

Authority передаёт разрешённый переносимый SceneModel; UNO объявляет порядок игроков при reverse. Русские строки новых Web адаптеров ещё входят в будущий общий вынос каталога приложения. Room/pairing orchestration, полный AssetResolver, семантические metrics, compiler и API cutover остаются незавершёнными.

Проверено: game-screen/game-flow/client-history — 16/16 до дополнения lifecycle; итог game-screen/authority/model-contract — 35/35. Local history layout — 24/24; client history — 3/3; network feedback — 7/7. Unified screen + UNO handoff — 20/20, затем новый personal layout — 5/5 (2/4/6 игроков, возврат поля, privacy, равные размеры, shortcuts). Финальные source build/SHA и полный выбранный gate — на окончательной паре RC.


## Четырнадцатый срез: единые показатели, команды и результаты

Все 12 SceneModel объявляют метрики с явными id/kind/value/label; generic playerContent строит счётчики из них. Повторные подсчёты в восьми Web views удалены. Результаты читают тот же SceneModel, без вызова игрового Web renderer и без сравнения чисел/русских подписей. Дополнительная строка определяется по metric IDs; ranking-only агрегат командного Лудо не дублируется. Позиция Змей отображается общим масштабируемым счётчиком вместо особого badge, motion counter имеет семантический ID.

Команды принадлежат паку: Ludo manifest задаёт teamLayouts с явными seatTeams/teams IDs; лобби/карточки/результаты используют декларацию, без modulo и проверки имени preset в общем UI. Team layout передаётся в public room game descriptor. Domain геометрия Лудо, шрифт, раскладка на финише и SVG жетонов не менялись.

SceneModel теперь пересобирается после authority action filtering: пауза, история и окно реакции не оставляют активных commands в переносимой сцене. История Стола различает audience и текущего actor: смена actor не сбрасывает курсор/границу.

Проверено: pack-models/model-contract/game-screen — 30/30 до дополнительных regression cases; game-screen/authority/model-contract — 36/36; network/table с новым Scene grants — 7/7; views — 15/15. Browser first-player + Ludo teams — 2/2; results geometry — 1/1. Старые статические fixtures теперь явно объявляют команды, а пример открытого Домино проецирует openHands в модели, не подменяет один из двух DTO. Compiler, все asset families, полный каталог приложения, room/pairing separation и cutover остаются впереди.


## Пятнадцатый срез: общие компоненты и локальные материалы

Канонический shared/components/game-components.js содержит artboard, карты main/compact, кубики flat/raised и числовые грани, шашки/дамки, домино, геометрию клеток, силуэт корабля, счётчики и шаблон таблицы. RoundToken остаётся отдельным каноническим компонентом. Потребители подключены: общий UI, карточные паки, Шашки, Домино, Лудо/Змеи, Ятзи и game-feedback. Баблы используют общую таблицу классов/CSS; стандартные звуки читаются из shared/sounds/standard-sounds.json. ZIP общих ресурсов теперь включает исполняемые components.

AssetResolver выбирает family/variant локально, сообщает fallback отсутствующего варианта и возвращает material bindings. Host resources закреплены provenance/SHA в core/shared-assets.json; без companion сборщик проверяет digest. Палитра имеет 101 слот, принятые light цвета/геометрия сохранены. Смена материалов не заменяет таблицу/скролл/ввод, не отправляет команду. Лудо/Змеи используют одни side/pawn slots; переносимая Ludo scene передаёт colorRole без HEX. Рецепты особых карточных лиц остаются в Web своего пака; общие artboard/resolver принадлежат семейству карты. Полный перенос UI цветов/текстов ещё впереди.

Уточнение личного экрана: role=player, живое подключение и подключённый Стол обязательны одновременно. Локальная партия/hotseat, архив, зритель и Стол не получают переключатель даже с сохранённой preference. На потере связи/отключении Стола поле возвращается автоматически; кнопка исчезает и из настроек. Пауза остаётся сверху.

Выбранные проверки: appearance/domain-foundation/game-screen/views — 44/44 до дополнительных cases; итог appearance/domain-foundation — 18/18. Game-screen — 11/11; unified-game-screen-browser — 5/5. Compact-hand/rc2-games-browser — 38/38; Ludo team markers — 1/1; после исправления compact recipe и подписей цветов итог compact-hand/appearance — 38/38. Artwork — 2/2 и checkers-drag/domino-layout — 22/22 при первоначальном извлечении без последующего изменения соответствующей геометрии. Это отдельные свидетельства затронутых контрактов, не финальная приёмка RC.

Остаются compiler/loader cutover, services комнат/pairing/recovery, общие input/modal/navigation и полный каталог локализации. Выпуск 0.18-rc.1 и отдельный preview не запускались; стабильная пара не изменялась.

## Заключительный срез · 2026-10-16

- Единый compiler паков: `shared/pack_compiler.py` и закреплённая SHA копия `tooling/`. Оба builder создают одинаковый bundle; пример автора тоже engineApi 3.
- RoomService, ClientConnectionService, RecoveryCoordinator, HostSessionService и HistorySyncService находятся в `application/`; Web identity/IndexedDB/WebLocks/WebRTC, pairing/hub presenters остаются адаптерами.
- Общий DOM ListController/ModalController сохраняет узлы, прокрутку и focus. Изменение партии инвалидирует выбор/drag, но сохраняет активную прокрутку.
- GameModel/Session/authority передают только явные проекции и публичные команды. Удалены эвристики скрытия рук и вычисления переноса карт по изменению скрытых массивов. Сеть использует protocol 2 и проверяет hello до команд.
- Круглые компоненты, клеточное размещение, веер/стопка и треугольник финиша используют канонические источники. Все семьи компонентов имеют material/skin hooks. Русский UI/aria/error вынесен в JSON, форматирование — через Translator.
- При скрытом поле личного сетевого игрока остаются кубики и выбранные приватные цели; расстановка Морского боя не допускает скрытие поля. Без подключённого Стола, при disconnect, на локальном/публичном/архивном экране функции нет. История остаётся в настройках; пауза — также наверху.
- API 1/2 больше не загружается. UpgradeService показывает полное обновление один раз; можно выгрузить исходные localStorage и IndexedDB архивы, без удаления данных. Смешанные сетевые протоколы отклоняются.

### Дополнения владельца к правилам и истории

- У каждого пака своя применимость завершения: Лудо/Змеи — до победителя, последний раунд, до последнего; UNO/Домино/Акулина/Дурак — два подходящих варианта. В остальных играх действует естественное завершение. При единственном варианте настройка отсутствует.
- Ограничение раундов: Лудо/Змеи (без предела либо 3/5/10/20/50), Ятзи (3/5/10/15). Пак может объявить своё условие и допустимые значения через settings; общий UI не интерпретирует условие вместо правил.
- Отдельны action revision, ход (`timeline.turn`) и объявленный паком раунд. Первая карта Пексесо, переброс/фиксация Ятзи, расстановка флота и добор без окончания хода не увеличивают номер хода. В Дураке ход завершается взятием/отбоем; раунд полного круга не объявляется. UNO не объявляет раунды из-за меняющегося направления и пропусков.
- Раунды отображаются для Лудо, Змей, Ятзи, Домино, Акулины и Рыбы. Номер и границы определяются паком и сохраняются/восстанавливаются вместе с партией.
- Слайдер истории остаётся по действиям; `<` / `>` переходят по ходам, `≪` / `≫` — по раундам. В утолщённой линии светлые точки ходов и черточки раундов; при совпадении границ приоритет у черточки. Граница догрузки независима.
- Мои партии и карточки возврата показывают ход/раунд; остановившийся игрок подчёркнут. У каждого правила есть пояснение рядом с настройкой. Общая справка: основные правила → режимы → настраиваемые правила.

### Проверка и выпуск

Выбран единственный заключительный состав `core,input,games,ui,storage,network,pairing`: все блоки затронуты заменой API/протокола и UI; это явный выбор для этой сквозной миграции, а не новый default выпуска. Полный прогон в packs повторно не запускается. Контрольные суммы двух сборок проверяются отдельно. RC получает отдельный catalog channel и Pages preview; production pointer и canonical deployment должны остаться прежними.

### Дополнение перед публикацией RC: семантика специальных действий

Общий публичный feedback contract skip/pass/discard/draw/take/reverse, один основной sound cue на action revision, новая красная подсветка/встряхивание skip с reduced motion. Паки публикуют пропуск по правилам (Лудо/Домино/UNO/Дурак); UNO reverse при двух оставшихся игроках — skip, стрелка скрыта. Канонические звуки/стили в shared паков. Адресные проверки: 7/7 sound/skip, 15/15 модели/UNO feedback, 12/12 browser skip/UNO. Полный цикл не повторялся.

### Дополнение: крупный показ публичного хода

Опциональный reveal из presentation и единый ActionReveal. Применение выбрано по смыслу для каждого пака (таблица SDK): UNO/Дурак/Домино — только публичная выкладка, Лудо/Змеи — кубики, Ятзи — только запись сочетания и точная active mask. Скрытые действия и обычные движения не увеличиваются. Очередь удерживает показ ≥1000 мс; карта летит к видимому назначению за 240 мс, кубики дублируются. Reduced motion/таймеры/отмена/сеть/восстановление учитываются, обычный card flight не дублируется. Проверки: models/feedback 14/14; дополнительные participation/privacy 3/3; browser skip/reveal 2/2.

## Терминальный результат RC, 2026-10-16

Все реализованные срезы выше вошли в immutable prereleases приложения 0.18.0-rc.1 / коллекции 0.7.0-rc.1. Последние дополнения skip/special sounds и public action reveal включены. **[Preview](https://51c9a867.playroom-hod-test.pages.dev)** проверено [Action #38846469923](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38846469923): access/runtime/12 pack hashes/offline passed, productionUnchanged=true. Main и стабильные 0.17.6 / 0.6.5 не переключались. Точные commit SHA, tests, assets, R2 snapshot, единственный preview upload и две остановленные до upload попытки — [RC report](RC-0.18.0-rc.1.md). Ранние пометки «впереди» в исторических срезах описывают состояние тех срезов; актуальное состояние — этот результат. Приёмка на реальных телефонах остаётся пользовательской приёмкой RC.


## RC4: продолжение пользовательской приёмки

Компоновки, меню, ассеты, аватары и новая колода описаны в [RC4](RC-0.18.0-rc.4.md). Сводка с точными выпусками и оставшимися работами — [HANDOFF-0.18](HANDOFF-0.18.md). Базовая миграция реализована; стабильный 0.18 ещё не объявляется.

RC5: builder автоматически включает HTML entrypoints в offline CORE и синхронизирует cache version с package.json. Полная PWA регрессия, включая настоящий offline запуск с аватарами; исходники/ассеты RC4 не переписываются.

Итог RC5: [preview](https://cc0f5728.playroom-hod-test.pages.dev), read-only verification [38931148300](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38931148300) success, productionUnchanged=true. Точная пара 0.18.0-rc.5 / 0.7.0-rc.4 и продолжение — HANDOFF-0.18.md.


## Приёмка RC6 · 2026-10-17

Общие рассадки/локальные настройки, темп UNO, системные исправления переворотов/добора, компактные панели и карточки продолжения реализованы в приложении. Выбранные проверки 103/103; [RC6 preview](https://b3d8ade9.playroom-hod-test.pages.dev), workflow 38943639349 success, productionUnchanged=true. Коллекция RC4 неизменна. Точные SHA и матрица — RC-0.18.0-rc.6.md. Базовая миграция API 3 не начиналась заново; дальнейшая работа — пользовательские замечания RC6.

## RC7 · 2026-10-17

Исправления приёмки после RC6 реализованы, выпущены app 0.18.0-rc.7 / collection 0.7.0-rc.5. [https://3acb8786.playroom-hod-test.pages.dev](https://3acb8786.playroom-hod-test.pages.dev), R2 channel 0.18-rc.5; protected/offline smoke success, productionUnchanged=true. Сохранность функций и границ подтверждается адресными сценариями, а не повторным стартом рефакторинга. Реализация, SHA, скриншоты и точные команды — [RC7](RC-0.18.0-rc.7.md). Следующий шаг — пользовательская приёмка RC7; stable отдельной задачей.
