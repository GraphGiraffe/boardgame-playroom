# Реестр переноса 0.18

[Утверждённый план](AUDIT-0.18.md) · [границы контрактов](REFACTOR-0.18-CONTRACTS.md).

Состояние на 2026-10-15: начат первый этап; таблица описывает сохранность функций, не объявляет новую версию проверенной. «Статика» означает наличие реализации/сценария, а не успешный запуск на новом коде. Перед переносом сценария уточняется его fixture и критерий. Релизы/деплой 0.17.6 / 0.6.5 остаются базой сравнения.

| ID | Функция / владелец сейчас | Проверка / свидетельство для переноса | Состояние |
| --- | --- | --- | --- |
| F01 | Hub: категории, порядок, скрытие, избранное — app/app.js, pack-manager | rc2-hub-browser, pack-update-notice-browser | Статика; перенос впереди |
| F02 | Фильтры/последняя игра/версия — app/app.js | rc2-hub-browser, ui | Статика |
| F03 | Установка, версии, quarantine — core/packs.js, pack-manager | view-contract, packs-reconcile | Статика |
| F04 | Каталог/скачивание/SHA — remote-catalog, pack route | packs-reconcile, pwa | Статика |
| F05 | Удаление одного/старых/всех паков и зависимых партий | rc2-games, ui; отказ сетевого архива отдельно | Статика; уточнить failure fixture |
| F06 | Локальные сохранения/полная очистка/паки остаются | session, history-library-layout-browser | Статика |
| F07 | Профиль/имя/роль/место/бот — multiplayer | player-profile, multiplayer-lobby | Статика |
| F08 | Команды/первый игрок/готовность/отсчёт/правила | multiplayer-lobby, ludo-team-markers-browser, lobby-layout-browser | Статика |
| F09 | Hotseat/закрытая рука/передача/пауза/продолжение | ui, quick-play, unified-game-screen-browser | Статика |
| F10 | Детерминизм seed/shuffle/dice — engine | engine + domain-foundation | Перенесён; domain/engine/session passed |
| F11 | Колода 36/52/54 и исключение Акулины — 4 rules.js | domain-foundation + rc2-games | Подключён; domain/rc2-games passed |
| F12 | Legal/apply/validate/projection — engine + 12 паков | engine, rc2-games, view-contract | Статика |
| F13 | Prepare/durable commit/ACK/retry — authority/session/store | authority, durable-authority, network-store-integrity | Статика |
| F14 | Скрытые данные игрока/зрителя/стола | rc2-games, view-contract, authority | Статика |
| F15 | Room: замена ботом/возврат/следующая партия | network-resume, network-next-match, multiplayer-lobby | Статика |
| F16 | Текст/QR/камера/share — pairing/PWA/scanner | pairing, qr-pairing-browser, pairing-methods-browser, pwa-share | Статика |
| F17 | Звуковое подключение/ручной адрес/отмена | acoustic-pairing, acoustic-webrtc-browser | Статика |
| F18 | WebRTC/presence/ошибки/восстановление | webrtc-transport, presence-transport, network-reconnect-browser | Статика |
| F19 | Хостовый журнал/lock/reload | host-recovery, network-session-store-browser, network-host-recovery-browser | Статика |
| F20 | Клиентский архив/backfill/read marker | network-client-history, network-client-history-browser | Статика |
| F21 | Replay/scrub/return/новый участок | history-library-layout-browser, network-client-history-browser | Статика |
| F22 | Source/target/адресат/выбор карты | drag, player-target, uno-drag | Статика |
| F23 | Ship drag/move/rotate/outside/цельный контур | rc2-games-browser + rc2-games | Статика; ручной touch повторить при переносе |
| F24 | Устойчивый scroll/pointer/focus | hand-navigation, hand-overflow-browser, mobile-navigation | Статика; сетевое обновление во время жеста уточнить |
| F25 | Motion/flip/roll/очередь/minimum wait | game-flow, motion-effects, motion-settings, network-feedback-browser | Статика |
| F26 | Баблы/адресат/success/error — game-feedback | game-feedback, uno-feedback, network-feedback-browser | Статика |
| F27 | UNO окна/пауза/сеть/повтор/штраф | uno-reactions, uno-social, authority | Статика |
| F28 | Звук/темп/reduced-motion/мой ход | game-flow, game-feedback, motion-settings | Статика |
| F29 | Карточки/счётчики/знаки/команды | game-screen, first-medallion-browser, ludo-team-markers-browser | Статика |
| F30 | Результаты/показатели/места/аватар | result-team-medallions-browser, game-screen, rc2-games | Статика |
| F31 | Все семьи ассетов/масштаб/веер/стопка | artwork, first-medallion-browser, result-team-medallions-browser | Статика; общий каталог нужен |
| F32 | PWA/offline/update/несколько окон | pwa, pwa-share, rc2-hub-browser | Статика; живая старая PWA — приёмка выпуска |
| F33 | Themes/skins/editor/toolbar | appearance model + Web adapter + native editor/picker; ui/appearance | Модель и Web проверены; AssetResolver / все материалы впереди |
| F34 | Locales/key/params/plural/aria/fallback | Translator + ru common/themes проверены; перенос остальных текстов впереди | Модель 6/6 |
| F35 | Автономный HTML/PWA/пак/архив/SHA | build.py обоих репозиториев, standalone check, pwa | Сборки HTML/PWA/паков, SHA и browser boot passed |

## Состояние паков

| Пак | Особенности, которые нельзя потерять | Перенос |
| --- | --- | --- |
| ludo | 1–3 dice/exit/guarantee/safe/capture/team help/stack/finish triangle | Впереди |
| battleship | russian/classic/setup/manual/auto/ready/ship drag/observer follow | Впереди |
| yatzy | 15 categories/3 rolls/hold/release/upper bonus/scroll | Впереди |
| pexeso | 36/52/54/reveal/flip/close/seen/mismatch/turn | Общая колода |
| gofish | 36/52/54/books/ask/response/repeat/empty stock | Общая колода |
| oldmaid | 35/54/53/pairs/hidden draw/out order/points | Общая колода с исключением |
| durak | 3 variants/decks/jokers/compose/undo/transfer/limits/refill | Общая колода |
| uno | 108 cards/color/penalty/manual-auto/declarations/protection | Впереди |
| checkers | forced chain/king/promotion/deferred capture/draw | Впереди |
| domino | endpoints/orientation/stock/pass/fish/score/long chain | Впереди |
| snakes | 64/100/bounce/link once/same-cell pawns/die | Впереди |
| tictactoe | assigned first/X-O/win/draw/bot/public | Первый кандидат нового API |

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
