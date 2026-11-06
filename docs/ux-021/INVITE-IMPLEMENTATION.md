# A09 · Приглашение из онлайн-лобби

Дата: 2026-11-02. Источники: owner-decisions-7 `invite=0`, connected prototype, `UX-STRUCTURAL-REVIEW-02.md`, `fidelity/reference-invite-{390,844}.png`.

## Реализация

`app/lobby-network.js` теперь показывает самостоятельный fullscreen `.lobby-invites-modal`: контекст игры/комнаты, вкладки Друзья / Группы / Ссылка, поиск, компактные строки выбора, общий счётчик и одна подписанная отправка. Выбор переживает вкладки и поворот. Выбор без Send ничего не отправляет; подтверждение на каждого адресата отсутствует. Успешные адресаты снимаются, оставшиеся сохраняются при частичной ошибке; повтор группы использует исходный UUID. Уже активное приглашение друга видно в его строке, отмена приглашения сохранена.

Вкладка ссылки вызывает настоящий `navigator.share` из пользовательского действия, предлагает копирование ссылки/номера. Отмена Share не считается ошибкой. Если Share недоступен, действие отключено с пояснением, копирование остаётся. Fallback без Clipboard API выделяет текст и объясняет ручное копирование; успешное копирование не имитируется.

Пароль, его ротация/копирование, видимость и разрешение приглашений игрокам находятся в room-only контексте: Лобби → Доступ и настройки → Доступ в комнату. Они не смешиваются с адресатами и не переносятся в общие настройки приложения. Host/phase/canManage проверяются до записи; существующие RPC и payload сохранены.

Данные и команды привязаны к account generation, room, participant и owner. Смена владельца/комнаты/аккаунта или закрытие комнаты инвалидирует frame; поздние ответы не восстанавливают старый экран и не продолжают следующие отправки. Проверка повторяется после итогового settings response перед его применением. Состояние busy принадлежит конкретному запуску и не перезаписывает следующий запуск после reset.

Файлы: `app/lobby-network.js`, одна entry в `LobbyView.roomContextMarkup`, screen classification в `game-screen.js`, новая scoped `app/invite-021.css`; по одной регистрации CSS в index/SW. A10 incoming/join функции и SQL не переписывались в этом изменении.

## Адресные проверки

Существующий `tests/cloud-account-browser.test.cjs` получил выбранный случай `online invite 0.21: destinations, partial retry, share intent and lobby access stay scoped`.

- Chromium: `PLAYROOM_CAPTURE_DIR=.../invite-021 node scripts/codex/test.cjs case/cloud-account-browser --name 'online invite 0.21'` — **1/1 PASS**, exit0.
- WebKit: тот же выбранный случай с `PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_INVITE_ENGINE=webkit` — **1/1 PASS**, exit0.
- В каждом: восемь checkpoint, pageerrors[]. Изолированный fetch-provider: intercepted20, **nativeSupabaseRequests0**. Реальная рассылка/Cloud DDL не выполнялись.

Проверены initial setup error и повтор в том же экране, выбор друзей+групп, сохранение между вкладками/поворотом, отсутствие отправки до Send, двойной тап без дублирования, частичный отказ с повтором оставшихся/тем же group UUID, Share/Clipboard intent и тихая отмена, Back в исходные lobby DOM/room, параметры доступа через отдельный room context, отсутствие пароля в ссылке при отключении, поздние owner/room/account ответы, closed-room deny. Owner/room смена здесь — инъекция readmodel в изолированной fixture, а не доказательство серверной передачи authority. Share/Clipboard перехвачены fixture и не доказывают физическое системное меню iPhone/Android.

Отчёты и PNG: `tmp_files/ux-021/invite-021/{chromium,webkit}-invite-report.json`, `*-invite-friends-390.png`, `*-invite-selected-844.png`, `*-invite-link-{390,844}.png`, `*-invite-link-dark-390.png`, `*-invite-access-390.png`.

## Старый большой social сценарий

Его A09 часть перенесена на вкладки/мультивыбор/Send, доступ комнаты, подписанные действия и active-root close. Group navigation использует Чаты. Проверка: `--name 'cloud social: fixed account prefix'` дошла через всю room/invite phase до `unknown contact` (≈37s), затем **0/1 FAIL** на старом `data-notification-open` пути, line266. NativeSupabaseRequests0 у обоих клиентов. Весь сценарий не объявляется зелёным; следующая notification цепочка не исправлялась в A09 scope. Адресные A09 проверки выше проходят независимо.

## Визуальная сверка и границы

Дизайнер сверил initial390 и selected844 попарно с approved invite0: порядок summary → tabs → search → selection → count/Send → fixed Back совпадает; нового structural blocker в этих двух кадрах не найдено. Остаток общего header/vertical gap: на844 summary y94 против reference y81, на390 примерно5–8px. Он относится к общей shell-типографике; локальные offsets не добавлялись. Дополнительно дизайнер просмотрел Link390/WebKit, Link844/Chromium и Access390: выбранная вкладка, URL/код и Share/Copy читаемы, overflow не найден, nested edge-panel соответствует общей поверхности. Осталась плотность Access при отключённом пароле: видны прочерки и неактивные смена/копирование; рекомендация скрывать pass-only детали до включения передана ведущему после source freeze. Приёмка всех состояний приложения не заявляется.

## Передача A10

Локальная инвентаризация обнаружила backend gap: `server/online.sql` discover (395) возвращает только20 видимых all/friends комнат, без полноценного code→preview. join-password (398) пишет join_attempts, membership и active_until. Тот же блок есть в `chat-actions.sql`246/249. `server/account-sync.sql`13 и `application/account-sync-service.js`4 содержат discover в read allowlist, отдельного lookup нет. Find нельзя строить на join-password. Для A10 нужен отдельный read-only lookup с определённой auth/rate/visibility политикой и минимальными публичными game/room/access полями без пароля/вступления. SQL и облако в этой инвентаризации не изменялись.
