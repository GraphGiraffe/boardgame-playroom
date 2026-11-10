# Заключительный дизайн-аудит ХОД 0.21 — рабочий журнал

Независимый дизайнер, 2 ноября 2026. **Общая приёмка A01–A36 пока не выдана.**
Основа — актуальные 421 строки GOAL.md, ACCEPTANCE-MATRIX.md, export7 и
выбранный связный прототип. Прежний общий visual PASS не переносится.

Последнее указание владельца переопределяет старый reference844: на главном
landscape логотип и компактная навигация слева; List в2колонки, square modes
адаптивны на3–5колонок, подписи не обещают неверное число. Tagline выровнен
сверху, hero/controls компактны. Старые844bottom-nav кадры в архиве являются
историческими; их прежнее принятие не действует для новой компоновки.

## Актуальное состояние после интеграции

Найденные в предыдущем независимом обходе дефекты ниже закрыты с адресными
доказательствами; их нельзя повторно считать действующими блокерами:

- Исчезновение каталога после сложного Social/Nearby пути: stable entity keys и
  retained root ownership; полный исходный business-case прошёл Chromium/WebKit
  по1/1, соседние случаи по4/4. [LONG-SOCIAL-MIGRATION.md](LONG-SOCIAL-MIGRATION.md).
- Контраст Light: canonical secondary #4f6059;126computed samples, metadata
  минимум5.044:1. [CONTRAST-READABILITY.md](CONTRAST-READABILITY.md).
- Ограничение ширины меню комнаты560px, первоначальный Deck без вариантов
  и технический404 как основной текст исправлены. Геометрия первого подтверждена
  дизайнером; два последних — targeted Chromium/WebKit UX acceptance.
  [FINAL-UX-REVIEW-NOW.md](FINAL-UX-REVIEW-NOW.md).
- Возврат между группами и игровым drawer: собственные controllers, сохранённые
  DOM/draft/selection; actualRTC+GroupAB по1/1 обоими движками.
  [GROUP-ROOM-OWNERSHIP-IMPLEMENTATION.md](GROUP-ROOM-OWNERSHIP-IMPLEMENTATION.md).

Независимые исправленные A15/A22/A33/A13/A16 и исторические кадры описаны ниже.
Текущий root walkthrough — [ROOT-FINAL-REVIEW.md](ROOT-FINAL-REVIEW.md); окончательный
локальный build — [LOCAL-CANDIDATE.md](LOCAL-CANDIDATE.md). Эти ссылки не превращают
более старые картинки в новые и не означают полного принятия A01–A36.

Единая multiplayer-цепь передачи туда/обратно, native scheduled bot, durable
finished и automatic result→sameLobby без countdown0 теперь подтверждена
Chromium2/2 иWebKit2/2 (spectator/table, TicTacToe).
[HANDOFF-COMPLETION-ACCEPTANCE.md](HANDOFF-COMPLETION-ACCEPTANCE.md).
Физические OSkeyboard, системный text scale, камера/звук/ShareSheet/HomeScreen
и внешние Push/ICE/TURN не приняты локальными браузерными симуляциями.

## Как собраны доказательства

Новые собственные кадры: workspace `tmp_files/ux-021/design-acceptance/`.
Использованы настоящее локальное приложение `serveBrowserFixture`, реальные
контроллеры, включённый SW и safe fetch provider до native Supabase. В social
fixture дополнительно запрещены send-message/group-send/invite/group-invite-room.
Регистрация, письма, реальные сообщения и приглашения не отправлялись.

Драйверы `/tmp/hod-design-final.cjs`, `/tmp/hod-design-social-invite-final.cjs`,
`/tmp/hod-design-dark.cjs`, `/tmp/hod-design-final-stable.cjs` переиспользуют
существующие `browser-origin.cjs` и `account-sync-fixture.cjs`. Это независимый
визуальный обход, не новый full-suite check и не замена functional evidence авторов.
Основные viewport390×844/844×390, Chromium system Chrome и локальный WebKit,
reduced motion для устойчивой фиксации. Dark применён через настоящую галерею.
JSON отчёты содержат engine, viewport, source SHA256 и nativeSupabaseRequests.

Парный самостоятельный [HTML-индекс всех36 тем](../../../tmp_files/ux-021/design-acceptance/overview.html)
содержит144 встроенных изображения без внешних зависимостей, поиск и раскрытие
тем. [Capture index](../../../tmp_files/ux-021/design-acceptance/capture-index.json)
фиксирует размеры, SHA256 и mtime каждого изображения. Текущий working-source
manifest хранится рядом; sourceStart/sourceEnd конкретного прохода находятся
в соответствующем engine-report, это разные границы доказательства.

Финальный общий WebKit core проход дал62 кадра, sourceStart==sourceEnd по всем
tracked files, native0/pageerrors[]. Единственная ошибка драйвера — его автоматический
updates locatorHandler перехватил собственное намеренное Close того же окна.
Она не выдаётся за дефект приложения или green whole-run; новый A33 проверяется
отдельно после freeze. Dark Chromium30 кадров и social Chromium/WebKit по24
кадра не имели native/page errors; social запрещает реальные send операции.

Два неуспешных предположения драйвера не выдаются за source-дефекты:

- Автоматический локальный SW update появился поверх roots в первом WebKit run.
  Он закрывается штатной headerbutton с сохранением кадра, PWA guard не подменён.
- Снимок сразу после поворота до RAF давал узкую полосу поля. После двух RAF
  actual Domino board364×364; отдельный bounded rotation-check измерил те же
  x119/y13/w364/h364 на0/63/208/610/1205ms. Поздний tutorial в этом повторе
  выключен существующей настройкой fixture; бессрочного ожидания не применялось.

Авторские final screenshots просматриваются непосредственно и отмечены отдельно
от снятых критиком. Ни число assertions, ни наличие функций не означают fidelity.
Базовые HEAD: app `c0722bc6655abf51c40419396c7367cd5d19da1f`, companion
`901153a71cc3d7dee991fc2aaf810c914084e007`; работа на незакоммиченном общем diff,
поэтому точный снимок задаётся SHA256 manifest, а не одним старым HEAD.

## Все 36 тем

«Выбранный scope принят» означает только перечисленные видимые состояния;
это не полное завершение темы, проверка физического телефона или production.

| Тема / выбранный reference | Последнее указание и целевая композиция | Прямая runtime/source сверка | Заключение и недоказанное |
|---|---|---|---|
| A01 navigation0 | 4 корня; portrait bottomnav, landscape compactleftlogo/rail по новому owner override; current/badge собственные | Fresh landscape WKlist844/Chromecompact932 +portrait390;32measured states автора/engine; прежние собственные roots исторические для844 | Новая показанная rail-композиция принята. WholeHub pending из-за social/autoscroll каталога; старый844bottomnav не текущий образец. |
| A02 catalog0 | Portrait list/2/3; landscape list2/squares3–5; linked View/Room, реальные counts/tags, favoritesfirst | Final landscape-hub list844/compact932/portrait390 непосредственно просмотрены;metadata18states/engine автора | Показанная плотность/metadata/firstrow126 приняты, hero больше не съедает landscape. Wholecatalog lifecycle pending15→0; другой sourcehash после PWA отмечен, не скрыт. |
| A03 gamecard0 | Короткая bottom panel; На устройстве/Онлайн/Рядом; reader; в низком844 без декоративного арта | Собственные game-card390/844 плюс final application-choice-gamecard обеengine | Выбранные2 ориентации приняты. Auth continuation и отмена владельцем проверены функционально; все cloud errors не просмотрены здесь. |
| A04 saved0 + filled connected states | Активные/История; компактная запись, quiet CTA/⋯, редкие операции в context | Final compact20 PNG: host/client/cloud/actions/history390/844 обоимиengine; просмотрены WK client390/actions844, собственный empty root | Compact выбранные состояния приняты. Больше нет прежних200–220px карточек/неверной nav pill. Все malformed/missingpack/import conflicts не приняты из этих кадров. |
| A05 lobby0 | Game summary/Rules → компактные люди/места → invite/autoStart/reason → fixed primary; без transport manager | Собственный local lobby390/844; final room-context playing lobby; actual RTC role captures | Local и shown playing composition приняты. Online/Table/large roster/autoStart ожидание всех видов команд не сведены в новый единый visual walkthrough. |
| A06 participant0 | Короткая panel; identity/status/роль, тихие действия по фактическим правам, red danger | Final13 choice states,19 непосредственно просмотренных кадров; current fullwidth844 computed3JSON | Выбранные роли/readonly/playing/offline приняты. Больше не используется исторический560px кадр; источник SDK-width проблемы не доказан. |
| A07 bots0 | Свободное/закрытое место → конкретный выбор;3 сложности; Advanced/Save/Remove; другие места в owncontext | Final choice bot/slot/local person; final room-context Otherplaces/closedseat | Показанные states приняты. Вход при allslotsclosed уточняется по коду/функциональному evidence, а не предполагается из обычногоfree-slot PNG. |
| A08 rules0 | Preset summary/reset → подробности → own fixed Save; reader отдельно; enum без sliders | Final rules-021 Domino390/Ludo844 и9checkpoints×2engine; footer12px/fullwidth, native shared switches | Выбранный summary/editor layout принят. Новая независимая фиксация invalid/всех пресетов каждого пака отсутствует; functional assertions не расширяют visual scope. |
| A09 invite0 | Fullscreen; summary→Друзья/Группы/Ссылка→search/selection/count→send; access отдельный контекст | invite-021 Friends390/selected844/Link390844/access390, обеengine; реальная модель selection | Эти состояния приняты. Письма/системный share sheet/реальные отправки не выполнялись; error/partialretry функциональны, все не показаны дизайнеру. |
| A10 join0 | Fullscreen code→Find→preview→явный Join; guest/auth и already-room без тупика | Final room-entry-captures guest390/preview390844 непосредственно просмотрены; новая menu row безnativegray | Выбранная композиция принята. Root Chrome/WK actual held admission child-return отдельно; production RPC rollout/все недоступные комнаты не доказаны PNG. |
| A11 connection0 | Fullscreen stage, честные direct/STUN/TURN details; unknown meter без fake%; check+method затем room | connection-021 checking/error/paused/success390/844,7 просмотренных кадров; actual presenter | Выбранные states приняты. Это контролируемая локальная сеть, не доказательство внешнего TURN/Pixel/iPhone. |
| A12 nearby1 | Fullscreen2телефона, одна QR/Sound/Code операция; landscape instructionsleft/completeQRright | Сейчас непосредственно просмотрены nearby-webkit showQR390844/receiveCode390; NEARBY source contracts | Показанные3 states согласуются с выбранной композицией. Все media denial/физическая камера/звук/маршрутизатор не приняты визуально; actualRTC13/14 stages отдельны. |
| A13 roomsettings1 | Короткие name/access/SaveCancel/red Close; без manager/rules/game/chat; gamecontext отдельный | Final room-context-structure settings390844/game390/Otherplaces/closedseat/playinglobby; ранее5name draft states | Новый local structural scope принят. Online access child и complete close consequences в этом финальном проходе не просмотрены. Остался P2 ширины danger844. |
| A14 game0 + later owner | Квадратный field на доступную высоту левее, opponentsleft/player+handright; настройки сверху/слева | Собственные actual Domino390/844, bounded WK rotation5times; непосредственно UNO844/frame-unified и actualLudo в A21 | Для этих выбранных layouts принят. Авторские15packs×45states/engine не превращаются в просмотр всех renderers/рук/механик критиком. Physical rotations отдельно. |
| A15 gamemenu0 | Panelbottom/right; Lobby/Rules/Settings/Stop, stable session ownership | Свой actual nativeoneclick localMenu→StopCancel после stable-ID fix Chrome/WK,8captures/engine; network menu ранее | Прежний local P1 закрыт независимым повтором. Показанный menu/confirm scope принят, не все роли. |
| A16 results0 | Fullscreen summary/typed rows/History/fixedLobby+Again | Actual Klondike715; live-completion actual draw9/botdefeat6/Ludo team612, final3кадра непосредственно просмотрены; presenter4variants отдельно | Показанные actual terminal layouts приняты. Legal transition→real UI/bot terminal→persist/history/rematch доказан автором локально; не production/multiplayerhandoff-stall/device. |
| A17 transfer2 | Passive topbanner→tap consent; продолжать игру; sender/outcome имя+человеческий эффект | Common registry consent390844 просмотрен; fresh WK lobby-copy называет Анну и объясняет управление комнатой/запуск/повторную готовность | Геометрия и новая shown lobby-copy приняты. Playing copy/пассивный banner/outcome families не осмотрены заново; старое technical «полное состояние» больше не используется как доказательство. |
| A18 social0 | Чаты/Друзья, local search, signed Create/Add, Notifications, quiet management; без toolstrip | Final community-owner5states390/844 с непосредственным независимым просмотром; собственный guest root | Выбранные состояния приняты. Все conversation/group transitions относятся к отдельному A22, не закрываются Community PASS. |
| A19 friends2 | Owned search states; relationship actions и profile bottom panel над исходным разговором | Fresh friend-search6states/12frames; oneRetry error390844; actual DM underlay preserved | Показанные search/Retry/underlay приняты. Все friendship outcomes/remove/notification имеют отдельные контракты; physical delivery не доказана. |
| A20 groups1 | Одна fullscreen createform, выбранные люди/submit; info quiet members/actions по правам | application-group-info/create/invite390844 обоимиengine,6 непосредственно сверенных states | Выбранные формы приняты. Все server role errors и реальные приглашения не проверялись этим просмотром. |
| A21 chat0 + later owner | Bottom/right resize drawer, edge launcher; unboxed history, actualteam tabs, capsule44px | Final UI-platform6selected states непосредственно просмотрены после builder rewrite; final15states/interop source | Структурные blockers закрыты, выбранные6 states приняты. Physical gesture/keyboard и дальнейшая A32 bubble policy отдельно. |
| A22 conversation0 | Fullscreen identity+quietmenu/search; history на фоне; scoped draft/unread | Final conversation-search fullDM390/group844/menu/search/error/boundary6states; собственные a22-current12кадров/native0 | Старые structural/missingSearch P1 закрыты. Показанный presentation scope принят. RPC/SQL search source ещё требует отдельного rollout; не заявлен production. |
| A23 message2 | Anchored9legacyreactions/Reply/Copy; quote и pinnedcapsule, selectabletext | Свой a22-current current popup390/replydraft844 и sharedRTC interop обоимиengine | Показанные current popup/composer states приняты. Старый boxedconversation screenshot исторический. Все clamping/longtext/selection combinations не приняты. |
| A24 invitecard0 | Active/joined/owned/transferred/expired; compact unavailable без Join, актуальная authority | Собственная safe provider sequence6states×2orientations; inspected active390/ownhost844/expired390 | Отрисовка этих states принимается отдельно от A22 контейнера. Realtime closure/counter decrement без открытия чата и offlinehost≠closed ещё не доказаны этим односторонним fixture. |
| A25 account0 intended modes | Real Login/Signup/Recover tabs, name/email/password, одинprimary; error+Retry вместе | Собственные3modes390844/light+dark; final login-error844/signup-error390; actualsafe Auth adapter | Выбранные формы/error accepted. Native OS keyboard/email delivery/все accountmanagement операции отдельно. Lab form0 имеет приоритет над connected fake username-only demo. |
| A26 profile0 + owner installation extension | Identity→quietsections→authfooter; новый подписанный Install row по явному заданию | Свой localeditor, signedaccount; fresh installation profileentry390 показывает новый разрешённый вход | Показанные root/identity/installentry приняты. Install не считается отклонением от старого6-row reference; все accountoperations отдельно. |
| A27 settings2 | Звук/Поведение/Доступность, контекстные(?), без ручного scale/shortcuts | Собственные6states×2engine, dark samples; common app tabs/current parameters | Показанная композиция принята. Allsettings reset consequences/все игровые роли не приняты по PNG. Version только here/update соблюдена в просмотренных screens. |
| A28 appearance1 | Fullscreen3tabs реальных образцов, own Cancel/Apply, old Light/Dark palette | Собственные gallery theme/deck/arts; final7 gallery/avatar states и responsive avatar390844 | Выбранные states приняты. Demo Garden/Sand темы не выдуманы. P2 initial deck неподходящей игры; все families/комбинации не осмотрены. |
| A29 data1 | Device/Cloud, measured storage/meter, sync, quietmaintenance/import/export/delete | Собственные guest device/cloud390844; final selected default/signed/expanded export в cloud-saves-020 | Выбранная композиция принята. При измерении unknown не показан fake%; conflicts/все права/late deletions functional отдельно, не visualall. |
| A30 packs0 | Installed/Available, compact realcards/status; quiet check/details; visibleimportpreview | Собственный installed with catalog404; final installed/Available-ready/error/importpreview390844 | Показанные states приняты. Нельзя считать actualknown404 пустым Available; retainsinstalled и Retry корректны. Late install/delete semantic evidence не visualfidelity. |
| A31 help0 + no wizard | Markdown brief one scroll; full sticky TOC; local contextual(?) | Собственные Domino brief390/full844; final reader4states обоимиengine | Выбранная композиция принята. Все pack rulebooks и длинные anchors не осмотрены заново; later owner отменяет demo steps. |
| A32 notifications0 | Passive topbanner/counters/quiet context events без duplicate; tap opensrelatedsurface | Собственный Notificationssettings; свежие banner/rendered-list routing reports; A32 duplicate source ещё меняется | **Частично/не принято целиком.** Нужен финальный direct visual/event overview после freeze; системная Push доставка отдельна. |
| A33 update0 | Always currentversion/check/error; realnotes/progress/restart; importantnotice retained | Свой actual Profile→current→realcheck→partialerror и importantnotice→Back exactSettingsparent,6captures/native0/errors[] | No-pending/notice P1 закрыты. CTA clip исправлен общим fixedfooter: own Chrome y334..378/h44, WK332..376/h44, внеmodal-body. Этотgeometry P1/P2 закрыт; actualPWA2/2 отдельно. |
| A34 gestures1 | Tap alternatives, press/release/bounce, swipe/resize, reducedmotion; no layoutshift | Direct A21launcher/motion-controlled captures; authored gesture/keyboard/reducedmotion checks | Ограниченный visual scope. Статичные PNG не принимают motion, physical swipe, keyboard. Полного независимого видеопросмотра gesturelist ещё нет. |
| A35 states0 + upgrade owned gate | Contextual loading/empty/error/offline/disabled/Retry; oldarchives сохраняются, понятное решение | Search/connection/chat selectedstates; Upgrade sharedscreen/realexport redaction Chrome/WK автора; новая человеческая copy source | Показанные families приняты в своих границах; новая человеческая upgrade-copy390844 непосредственно переснята и принята. Нет all36state coverage; техническое API в прежнем PNG историческое. |
| A36 confirm1 | Common consequencepanel/currentunderlay, явныйdanger+Cancel | Свои actual Logout/Reset/RoomExit/LocalStop Cancel-only Chrome/WK по8кадров; native0/errors[] | Эти4формы и retainedunderlays приняты; local Stop больше не заблокирован A15. Kick/delete/recoverableerror и destructiveConfirm не выполнялись этим обходом. |

## Что нужно для общего заключения

Закрыть catalog15→0 и повторить затронутые сквозные сценарии; Light contrast уже исправлен и actual-проверен.
Дополнить A32/A17 семьи событий, A24 live lifecycle/badge
и representative confirmations; подписать оставшиеся desktop/device/network
границы. Обновить эту таблицу по прямому evidence, а не массовой заменой статусов.
Свежий shell overview и paired references служат навигацией по материалам,
но не заменяют чтение ограничений каждой строки.

Production deployment, Auth/Supabase DDL, объявления, физические iPhone/Pixel,
акустика/камера, внешние ICE/TURN и системные Push **не выполнялись и не приняты**
этим дизайн-аудитом. Общий release status и RoadMap ведёт root.


## Дополнительный независимый A16/A36 scope

`design-acceptance/results-presenter/` содержит8кадров каждого движка:
defeat/draw/team/public ×390/844. Драйвер использует существующие данные
`tests/game-screen.test.cjs` и настоящий resultMarkup/common modal, а не копию
разметки. Непосредственно просмотрены Chrome team390844/draw390/defeat390/
public844 и WebKit team390/draw844/public390. Типизированные счётчики, командные
медальоны, итог и fixed footer различимы, новых structural P0/P1 нет. В низком
landscape большая summary оставляет первый row над footer — так же устроен
выбранный reference-results844; остальные записи прокручиваются. Это приёмка
presenter geometry этих данных, не получение результата живой multiplayer игры.
Оба engine отчёта:8captures/pageerrors[]/native0, sourcehash указан.

Собственные `chromium-social-confirm-{logout,reset,room-exit}-{390,844}.png`
получены настоящими UI действиями, нажималась только Отмена. Consequences,
защищённый исходный account/settings/lobby и раздельные Cancel/danger понятны.
Первый driver не дошёл до Local Stop из-за подтверждённого A15P1; это не green
полный check. В `chromium-confirm-trace-report.json` доставленный native click
даёт openedfalse без modal mutations, sessionSamefalse при неизменных shell/layout.
Root/UI отдельно подтвердили newrestoreSession источник; await stable-ID fix.

HTML-проверка завершена альтернативным корректным способом:36тем/144встроенных
PNG декодированы и проверены PIL; браузерный точный поиск A22 и раскрытие работают.
Первое ожидание decode lazy-изображений внутри закрытых details зависало и было
адресно завершено (только собственный подтверждённый process). Это не успех теста
и не дефект артефакта; финальная проверка не зависит от lazy-loading offscreen.


## Повторный review после исправлений и нового owner landscape

Прямо просмотрены settled A22: Chrome fullDM390/searchDM390, WebKit fullGroup844/
menuDM390/searchErrorGroup844/groupHistoryBoundary844. Собственный безопасный
проход дополнительно снял12current conversation/account/popup/reply/underlay
кадров Chromium (`a22-current/`), без send actions, native0/pageerrors[].
Plain history, quiet menu, owned search и contextual unavailable-target/error
соответствуют выбранному решению. SQL source/backend acceptance не означает
развёрнутый production search, это остаётся отдельной границей.

Прежний actual Cancel-only сценарий A15/A36 повторён на исправленном stable-ID
runtime: Chromium8captures и WebKit8captures, errors[]/native0. Один native click
открыл локальное меню, Stop открыл общую bottom confirmation над тем же меню,
Отмена вернула его. Просмотрены Stop390Chrome/844WebKit. Обобщение RTC PASS на
локальную ветку больше не требуется: она проверена отдельно.

Actual live completion: просмотрены WebKit draw9portrait, Chrome bot-defeat6portrait,
WebKit Ludo-team612landscape из `live-completion/`. Теперь есть terminal pipeline
после legal preparation и реального UI/bot последнего хода, а не только synthetic
result presenter. Layout/fixed footer согласуются с reference. Автор проверил
history/persistence/Active-History/rematch локально; прежний multiplayer host-transfer
stall, production и реальные устройства этим не объявляются исправленными.

Новый landscape: непосредственно просмотрены final WK list844, Chromecompact932
и restoredportrait390. Rail/logo left, two-column list,5compactcolumns при932,
hero/tagline top alignment и metadata приоритет соблюдены; первые карточки на126px.
Это принятие показанной композиции по последнему owner override. Старые844bottomnav
PNG исторические. `source-sha256.txt` hub-shell hash от этапа до PWA не совпадает
с последующим working CSS; это отмечено автору, а не выдаётся за frozen wholeHub.
Свои mixed Chrome/WK пути Social→DMdraft→Games→reload→lastTTTcard сохранили15cards
и открыли panel при model15/errors[]/native0; более сложный A/B emptycatalog остаётся
отдельным блокером root/UI. Новая смешанная проверка не включает реальные sends.

A33 самостоятельно: current entry → настоящий read-only checkForUpdate/catalog →
recoverable partialerror → close → Settings → локальный existing important-notice
UI route → Back. Шесть Chromium кадров, exact Settings parentRestoredtrue,
errors[]/native0. Объявление другим пользователям не отправлялось. Entry/notice P1
закрыты. Измеренный partialerror CTA clip343..387 противscrollbodybottom378 передан
root; исправление общим fixedfooter пока ждёт последней независимой сверки.

Upgrade copy переснята собственным реальным controller fixture в390/844:
«Обновление формата игр», понятные данные/архив/прежняя версия и «Продолжить».
Техническое API из старых кадров заменено; copy замечание закрыто. Export/Accept
не нажимались в этом повторе, их real-export/redaction evidence принадлежит
ранее описанному author case. P2: длинная backup-кнопка имеет3строки/около80px,
Continue44px, нижние края не совпадают; это общее action-row выравнивание, не причина
вводить новый flow.

Установка PWA — разрешённое владельцем расширение старого прототипа. После root
freeze/final Chrome1/WK1 и unit4 просмотрены WK hint390/profileentry390/guide844.
Тихий подписанный Install entry, компактный dismissible hint и manual3steps
понятны, накладная panel не ломает underlay. В guides/CTA44px нет нового видимого
структурного P1. Это UA/браузерный controlled scope, не реальный Safari share menu,
nativeOSprompt или подтверждение физической установки. Старый heroicon не является
требованием нового UI. Новый профиль с Install row не считается отклонением от
старого6-row reference.


## Финальные точечные bbox после общей правки root

A33 actual partialerror844: Chromium button334..378/h44, WebKit332..376/h44,
`footerOutsideBody:true` в обоих own reports. Новый fixedfooter больше не обрезан
scroll-body; старый35pxвидимый кадр сохранён как historical-a33-clipped-844.png.
Перепроверялась геометрия, не весь прежний набор backend/update операций.

Upgrade390: обе кнопки80px с одинаковым bottom832 в Chromium и WebKit. PWA hint390:
48px height, text266px, chevron12px/flex0 0auto — лишнее деление ширины устранено.
Notification open теперь44px, hit-testtrue, tap ведёт в Ember. Эти точечные
замечания закрыты; pageerrors[]/native0. Часть caption/font метрик снималась только
в Chromium и не превращается в физическую проверку iPhone.

Общий дополнительный web.dev/W3C audit выявил новый реальный readability gap Light,
а не геометрии: CONTRAST-READABILITY.md и contrast-021/chromium-computed.json.
Canonical readable-secondary позднее внедрён и actual-проверен; конкретный contrast
дефект закрыт, общий gate остаётся открытым по иным указанным границам. Отдельная CSS root-font simulation помечена как simulation, без OSzoomclaim.


Финальная контрастная правка проверена фактически:126computedsamples/6groups,
Light metadata≥5.044:1, Light secondarypaper5.851:1, Dark metadata≥5.579:1.
Это изменение semantic token, не новая палитра фонов/артов. Часть layout PNG в
индексе снята до усиления вторичного текста и исторична именно для его оттенка;
точные current colors находятся в contrast-021/chromium-computed.json. Они не
выдаются за окончательный pixel-approved набор всех экранов.
