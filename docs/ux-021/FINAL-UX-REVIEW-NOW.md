# Свежая заключительная UX-ревизия 0.21

02.11.2026, независимый UX-критик. Это заключение по указанным маршрутам и всем
36 областям, **не** объявление полной готовности приложения или публикации.
Прочитаны GOAL, ACCEPTANCE-MATRIX, WEB-DEV-AUDIT и текущий DESIGN-ACCEPTANCE.
Последние указания владельца важнее старых макетов: landscape rail с логотипом,
строки в две колонки, квадратные карточки в 3–5, реальные число игроков/теги раньше
описания, спокойные подписанные строки вместо россыпи кнопок.

## Текущий gate после интеграции

Полный long-social/leaveLobby/catalog путь уже прошёл Chromium/WebKit по1/1,
соседние UI случаи — по4/4: [LONG-SOCIAL-MIGRATION.md](LONG-SOCIAL-MIGRATION.md).
GroupA→уведомление GroupB→Back и RTC drawer→Group→Back также подтверждены обоими
движками: [GROUP-ROOM-OWNERSHIP-IMPLEMENTATION.md](GROUP-ROOM-OWNERSHIP-IMPLEMENTATION.md).
Последние membership/inbox epochs и retained search описаны в
[GROUP-CHAT-OWNERSHIP-REVIEW.md](GROUP-CHAT-OWNERSHIP-REVIEW.md).
Локальные notification routing/no-duplicate и semantic audio имеют собственные
свидетельства: [CHAT-BUBBLE-POLICY.md](CHAT-BUBBLE-POLICY.md),
[PUSH-AND-FEEDBACK.md](PUSH-AND-FEEDBACK.md). Они не остаются старыми runtime gates
только потому, что ниже сохранены границы исходного независимого обхода.

**Интегрированная цепочка теперь подтверждена:** playing handoff→обратно→
штатный scheduled bot→автоматический результат обоих RTC peers→то же лобби
без countdown0. Existing spectator/table case: Chromium2/2 иWebKit2/2,
proof-game TicTacToe, durable finished/revision6. Это common-pipeline evidence,
не post-handoff приёмка каждой игры. [HANDOFF-COMPLETION-ACCEPTANCE.md](HANDOFF-COMPLETION-ACCEPTANCE.md).

Физические устройства/OS/Push/NAT и production rollout остаются отдельными
границами. Короткий маршрут владельца — [OWNER-ACCEPTANCE.md](OWNER-ACCEPTANCE.md).
Актуальные источники и кандидат: [ROOT-FINAL-REVIEW.md](ROOT-FINAL-REVIEW.md),
[LOCAL-CANDIDATE.md](LOCAL-CANDIDATE.md). Это не автоматическая публикация или
полная пользовательская приёмка всех36 тем.

## Результат

В свежем ограниченном обходе не найдено нового P0/P1, препятствующего проверенным
переходам. Исправлен подтверждённый P2: действие «Открыть личный чат» из профиля
уже открытого собеседника создавало второй экземпляр этого же разговора. Теперь
оно возвращает исходный DM, editor и черновик; один Back ведёт в список.

Действия каталог → карточка → чтение правил → режим → лобби ясно различаются.
Правила и параметры игры не смешаны. Профиль стал индексом разделов, настройки —
категориями, редкие операции данных и списков не конкурируют с основными.
Подложки сохраняются; ошибка Auth имеет понятный текст и повторную отправку,
пустой поиск не изображает сетевой сбой. Это вывод о конкретно пройденных путях.

Два найденных P2 устранены по разрешению root; результаты адресного повтора — в дополнении в конце. Полный long-social позднее подтверждён отдельным сценарием, а не этим одноактёрным walkthrough. Единственная ожидаемая объединённая локальная цепочка handoff/bot/result указана в текущем gate выше; физические границы сохраняются.

## Как проверялось

Использованы существующие драйверы из `design-acceptance/drivers`, существующий
`serveBrowserFixture` и `account-sync-fixture.installFetch` **до goto**. Драйверы
лишь адаптированы под иной порядок и несколько ограниченных возвратов; новая
продуктовая тестовая система не создавалась. Копии использованных драйверов и
результаты: workspace `tmp_files/ux-021/final-ux-now/`.

- **Core:** 33 состояния ×390×844 /844×390 в Chromium и WebKit, по66 кадров.
  Root → профиль/редактор → настройки → данные → пакеты → оформление →
  уведомления → режимы аккаунта → установка/обновление → виды/фильтры каталога →
  карточка/краткие и полные правила → локальное лобби → параметры комнаты →
  настоящая партия Домино → меню → остановка/отмена.
- **Social:** по18 кадров: настоящий безопасный Auth adapter → DM → действия
  сообщения → ответ/многострочный черновик → профиль поверх DM → возврат →
  поиск/no-results → возврат с тем же черновиком → группа/информация →
  каталог/последняя карточка. Отправки сообщений/приглашений запрещены fixture.
- **Nested return:** по6 кадров: локальное имя → аватар → поворот/Back → тот же
  draft → Cancel; Данные/Облако → вход → контролируемая503 → Back → тот же DOM
  Данных и выбранная вкладка Облако.
- **Return edge после исправления:** по2 кадра: DM → профиль → «Открыть личный
  чат» → **sameChat:true** → один Back к списку; черновик сохранён.

Во всех завершённых маршрутах pageerrors=[] и nativeSupabaseRequests=0. В social
и return-edge provider действительно перехвачен (11 и6 запросов соответственно),
а не просто отсутствует счётчик. У записанных файлов core/social sourceStart и
sourceEnd совпадали внутри каждого запуска; это не утверждение о неизменности
всей общей рабочей папки или о SHA production. После узкой правки A19 повторён
именно затронутый путь, прежние PNG социального профиля историчны для его действия.

В `landscape-form` отдельно измерена форма ошибки после поворота: часть feedback
оказалась ниже viewport, но собственный scroller работал (client284/scroll438).
Прокрутка показывала **вместе** error и Submit: y297..378, height81. Это обычная
длинная форма, не недоступная кнопка и не новый P1. Физическая клавиатура iOS/Android
этим не моделировалась.

Две остановки адаптированных драйверов были ошибками selectors/ожидаемой copy
(`Ничего` вместо `Сообщений не найдено`, data-attribute вместо `.account-message`).
Они не названы продуктовым дефектом или PASS; после исправления драйверов пути
завершены. Полные отчёты с hashes/метриками лежат в указанных каталогах.

## Матрица всех 36 областей

**D** — свежие реальные действия этой ревизии; **S** — чтение текущего исходника;
**E** — выбранные существующие evidence/авторские сценарии, а не новый самостоятельный
прогон; **P** — физический/внешний пробел. Ни одна строка не означает все роли и
все ошибки одновременно.

| Область | Что независимо оценено | Граница / остаток |
|---|---|---|
| A01 Навигация | **D:** четыре корня в обоих поворотах, названия, активное назначение, rail/логотип. | Сложный multi-actor social возврат отдельно у UI; не закрыт простым обходом. |
| A02 Каталог | **D:** list/2/3, landscape плотность, связанные View/Room, фильтр-панель и последняя карточка после Social. | Избранное/сохранение порядка/все metadata комбинации — **E** LANDSCAPE-HUB; long-case позднее подтверждён отдельным LONG-SOCIAL-MIGRATION, см. текущий gate. |
| A03 Карточка | **D:** короткая panel, порядок На устройстве/Онлайн/Рядом, правила и возврат к карточке до создания комнаты. | Онлайн Auth continuation/отмена — **E** context-choices; не новый native connect. |
| A04 Мои партии | **D:** пустой root Активные/История понятен. **E:** compact host/client/cloud/history и свайпы. | Все malformed/missing-pack/import-conflicts не пройдены заново. |
| A05 Лобби | **D:** локальная комната с человеком/средним ботом, правила/параметры/нижний старт, возврат. | Онлайн/зритель/Стол/автостарт по готовности — **E**, не доказаны этим hotseat. |
| A06 Участник | **S/E:** единые quiet actions, актуальные причины передачи/ролей, context-choices RTC. | Полные room role permutations не новые D; профиль собеседника A19 проверен отдельно. |
| A07 Боты/места | **E:** отдельные выборы места/бота/сложности с Cancel/Save и readonly reason. | В этом обходе бот не редактировался; все ограничения команд отдельно. |
| A08 Параметры игры | **D:** вход отделён от чтения правил. **E:** editor/presets/Cancel. | Все presets/invalid/ready reset — прежние функциональные проверки, не fresh D. |
| A09 Приглашение | **E:** просмотрен новый fullscreen friends picker: room/game, tabs, selection/count/send. | Самостоятельной отправки не было; system Share и реальные адресаты — **P/внешний scope**. |
| A10 Вход | **E:** ENTRY-IMPLEMENTATION: Find/preview/Join разделены, поиск без членства. | Не выдавать прежний join-password за preview; production SQL rollout не выполнен этим аудитом. |
| A11 Подключение | **E:** просмотрен current success: checkmark, фактический метод, закрытые подробности и Cancel. | Таймер/ICE берутся из author cases; внешний NAT/TURN/iPhone/Pixel — **P**. |
| A12 Рядом | **E:** просмотрены Show QR / Receive answer code с ролью/шагом/инструкцией/primary. | Авторские local RTC13/delegated14 отдельно; камера/звук двух телефонов — **P**. |
| A13 Комната | **D:** короткая name panel поверх того же лобби, Save/Cancel и последствие закрытия различимы. | Здесь Cancel; реальное закрытие/authority/access — **E**, не destructive D. |
| A14 Партия | **D:** настоящий Domino hotseat в390/844, квадрат поля/левая зона/меню поверх. | Все15 паков/руки/приватность — **E** integration, физические повороты — **P**. |
| A15 Меню | **D:** quiet Lobby/Rules/Settings/Stop, bottom/right overlay, остановка/Cancel без смены партии. | Онлайн read-only роли и все rare actions — **E**. |
| A16 Итоги | **E:** просмотрен actual team-result844; clear result/Lobby/Again и scroll. | Нового самостоятельного завершения живой партии не было; actual draw/defeat/team612 — author evidence. |
| A17 Хост | **E:** добровольный offer/banner→panel, permission/identity guards; решения в GOAL соблюдены. | Двусторонние handoff proofs отдельные; combined handoff→bot→result→lobby пока pending у UI, см. текущий gate. |
| A18 Общение | **D/S:** Chats/Friends, доступные DM/group, local search; текущие signed Create/Add/Notifications/quiet maintenance в source. | Не переносить старые toolstrip PNG в current acceptance; все счётчики — **E** owner cases. |
| A19 Друзья | **D:** профиль над DM, Back с черновиком; повторное открытие DM исправлено/перепроверено. **E:** поиск/заявки. | Phone Push при friendship outcome — **P**, не следствие safefixture. |
| A20 Группа | **D:** fullscreen GroupInfo и возврат к группе. **E:** одна форма/участники/partial-retry. | В walkthrough создание/приглашения не выполнялись; отдельный business regression использовал только безопасную fixture, без реальных адресатов. |
| A21 Чат партии | **E:** новый drawer, edge launcher/resize/room-team/drafts, actual RTC15states. | В локальном hotseat сетевой чат закономерно отсутствует; physical drag/keyboard — **P**. |
| A22 Разговор | **D:** полный DM/group, quiet menu, no-result search и Back к тому же draft. | Fixture поиск read-only; настоящая server-history/privacy/pagination — **E**, production SQL отдельно. |
| A23 Сообщения | **D:** anchored9reactions/Reply/Copy, reply draft и multiline composer. | Реакция/отправка не нажимались; actual attached reactions/ACK — **E** A23/RTC. |
| A24 Приглашение в чате | **E:** owner/accepted/transferred/closed/cache lifecycle cases. | Live badge closure без открытия чата и rejoin boundary не новый D; source author epoch fix отдельно. |
| A25 Аккаунт | **D:** Login/Signup/Recover, безопасный fixture login и503, сохранённый ввод/Back в Data. | Реальные email/смена/восстановление/OS autofill — **P/внешний scope**. |
| A26 Профиль | **D:** тихий индекс, локальный nickname draft/Cancel, avatar Back exact DOM, auth entry. | Новый Save/смена аккаунта не выполнялись этим обходом; lifecycle — **E**. |
| A27 Настройки | **D:** Звук/Поведение/Доступность, без scale/identity shortcut, понятные параметры. | Значения не массово менялись; master mute/audio assertions — **E**. |
| A28 Оформление | **D:** Theme/Deck/Arts, явные Cancel/Apply; Cancel и parent. | Начальный Deck исправлен после ревизии, см. дополнение; все family choices/Apply — **E**. |
| A29 Данные | **D:** measured Device summary/Cloud guest и nested Auth503→тот же cloud tab. | Import/export/delete/conflict/late writes — **E** DATA-IMPLEMENTATION; не выполнялись здесь. |
| A30 Игры/обновления | **D:** Installed/Available/error/retry entry, quiet maintenance. | Available local404 — честный error, не production outage; Technical code перенесён в закрытые подробности после ревизии, см. дополнение. |
| A31 Правила/пояснения | **D:** brief/full scroll, явный TOC и отдельный reader из карточки. | Все anchors/все rulebooks/context(?) — **E**, не новый allpack pass. |
| A32 Оповещения | **D:** настройки уведомлений. **S/E:** ui-feedback с semantic cues/master/uiEnabled/busy/250ms guard, routing/bubbles cases. | Звуки уже реализованы, это не missing feature. Локальные routing/bubble/audio proofs отдельные и уже есть; физическая слышимость/доставка OS Push — **P**. |
| A33 Обновление | **D:** доступный current version screen/check action в390/844, понятное отделение app/pack. | Здесь не Apply/reload; actual PWA check/download/resume2/2 — **E**, native phone update — **P**. |
| A34 Жесты/motion | **D:** tap alternatives/поворот/обе ориентации; для стабильных PNG reduced motion. | Статичные PNG не подтверждают bounce/press/release; gestures/native keyboard — **E/P**. |
| A35 Состояния | **D:** empty, no-results, guest,503auth, catalog404 и normal safe success. | Не все forbidden/offline/loading/late/outcome семьи; source/evidence границы сохранить. |
| A36 Подтверждения | **D:** остановка actual local session → Cancel, исходный контекст остаётся. | Logout/Reset/RoomExit/Kick/Delete — **E**; destructive Confirm здесь не выполнялся. |

## Исправление по результату ревизии

Узкий explicit capability: `FriendProfileUI.show(...,{onChatReturn})` получает
`captureReturn` только от `ChatUI.showProfile`. Кнопка возвращает исходную
поверхность; из Search/Friends/Participant без capability остаётся обычный
`ChatUI.show`. Аккаунт/поколение/активный frame проверяются; дополнительно button
обязан принадлежать текущему profileRoot. Старая кнопка приостановленного профиля
не может вызвать return capability другого активного окна.

Регрессия добавлена в существующий `community-actions-browser` case
`group members distinguish self and group forms...`, без новой большой harness:

```
node scripts/codex/test.cjs case/community-actions-browser --name 'group members distinguish'
PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit HOD_WEBKIT=1 node scripts/codex/test.cjs case/community-actions-browser --name 'group members distinguish'
```

Оба PASS1/1: exact DM/editor/draft, один Back к списку, foreign suspended button
не вызывает чужой port; остальные групповые проверки case сохранены. Прямой
ограниченный driver после fix также завершён обеими engine без native requests.
Остальные файлы/протоколы/production не менялись этим исправлением.

## Найденные P2 и решение об установке

1. **P2 / A28, впоследствии исправлен:** первый Deck открывается на Морском бое с сообщением «только
   стандартное оформление», хотя другие семьи имеют варианты. При отсутствии
   явного сохранённого/контекстного выбора лучше начинать с игры с вариантами
   текущей вкладки. Явный выбор человека не перезаписывать. Подтверждено новым PNG,
   не только прежним DESIGN-ACCEPTANCE.
2. **P2 / A30, впоследствии исправлен:** «Каталог недоступен:404» — техническая деталь в основном сообщении.
   Первичный текст должен говорить о невозможности загрузить список и предлагать
   повтор; код можно оставить в деталях. Нынешний Retry виден, это не тупик.
3. **Текущий общий gate:** combined handoff→bot→result→lobby пока pending у UI; физические проверки отдельно. Long-social, A32 routing/audio и group-return уже имеют поздние proofs, перечисленные в начале. Общий release/goal ведёт root.

Установка: для0.21 сохранить общий короткий panel. Он объясняет значок/офлайн,
затем native режим показывает явное «Установить», manual — инструкцию. Один лишний
тап редкой задачи здесь не равен лишним петлям повседневного общения. Отдельное
native direct-prompt можно улучшить позже, без обязательной переделки после green.
[web.dev Installation prompt](https://web.dev/learn/pwa/installation-prompt)
допускает собственный контекст/подсказки перед вызовом сохранённого prompt и manual
fallback; требования «строго один тап» там нет. Устаревшие утверждения этой главы
про iOS браузеры не использованы как актуальная платформенная истина.

## Что не проверено физически и не опубликовано

iPhone/Safari Home Screen, Pixel/Samsung/Xiaomi, OS text-size/клавиатура/выделение,
VoiceOver/TalkBack, camera/mic/акустика, реальный NAT/TURN, Push delivery, native
install prompt и завершённая системная установка. Эмуляция WebKit этого не заменяет.
Production SQL/Auth/DDL, рассылка важных обновлений, deploy и release не выполнялись.
Проверенный UI не означает, что server search/preview уже доступны на production.


## Дополнение: оба остаточных P2 устранены

По отдельному lease root, без нового дизайна и API:

- `app/appearance-ui.js`: при первом глобальном входе в Deck/Arts без явного
  прежнего или текущего контекстного выбора находится первая игра с реальными
  вариантами нужной family через существующий `families()`. Контекст берётся
  только из фактической `#app .game-scene`, штатный inert под Settings не мешает.
  Автоматический fallback не запоминается как пользовательский. Dropdown/skin
  choice запоминаются намеренно, сохранённый skin по-прежнему меняется только
  Apply. Context-only открытие не перезаписывает прежний explicit last game.
- У текущих ресурсов дополнительные варианты есть только у card-face. Поэтому
  Deck начинает с настоящих образцов, Arts честно остаётся стандартным, пока
  реальных дополнительных вариантов нет. Новые арты или fake choices не созданы.
- `app/pack-manager.js`: источник raw404 прослежен до `RemoteCatalog.refresh`,
  который формирует ошибку по response.status; `load()` сохраняет её в warning.
  Основное сообщение теперь «Не удалось загрузить список игр. Проверьте соединение
  и повторите проверку». Сырой текст доступен в закрытых «Технических подробностях»;
  Retry остаётся рядом, установленные игры сохраняются. fetch/install/remove и
  ownership не менялись.

Проверки существующих cases после финальных изменений:

```
node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery previews named skins'
node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery 0.21 owns'
PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_APPEARANCE_ENGINE=webkit node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery'
node scripts/codex/test.cjs case/pack-update-notice-browser --name 'pack manager 0.21'
PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_PACKS_ENGINE=webkit node scripts/codex/test.cjs case/pack-update-notice-browser --name 'pack manager 0.21'
```

Appearance: Chromium1/1 +1/1, WebKit3/3. Проверены полезный autoDeck, honest Arts,
нефиксируемый автоматический fallback, explicit game/skin, contextual Yatzy под
Settings и прежние draft/Apply/Cancel guards. Первоначальное тестовое требование
дополнительных Arts при их фактическом отсутствии исправлено; не выдаётся за
продуктовый сбой. PackManager: Chromium1/1, WebKit1/1, существующий import/install/
remove/late-return scope сохранён. Обе browser fixtures проверяют nativeSupabase=0.
Новые collapsed/expanded error кадры:
`tmp_files/ux-021/final-ux-now/packs-p2/{engine}-packs-available-error[-details]-390.png`.

Оба узких исправления заморожены. Они не закрывают физические проверки,
production rollout или pending combined handoff/bot/result chain вместо их владельцев.
