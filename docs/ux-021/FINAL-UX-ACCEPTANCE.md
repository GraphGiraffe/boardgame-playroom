# Поведенческие проверки 0.21: визуальная приёмка отозвана

**Уточнение владельца:** текущий runtime отвергнут по соответствию утверждённому
прототипу. Все прежние visual PASS/accepted в этом отчёте означают только
исторические наблюдения, не принятие дизайна0.21. Поведенческие проверки полезны
как regression evidence. Структурное соответствие всем36выбранным решениям должно
быть проверено заново; например Settings = вкладки категорий, Lobby = выбранный
roomBody, а не legacylayout с подписями. Нижние записи сохранены без сокрытияистории.

# Первый реальный поведенческий проход

01.11.2026. Первый проход после стабилизации profile/settings; **вся 0.21 не принята**.
Использовано настоящее приложение через существующий `serveBrowserFixture` и
реальные установленные companion renderer/правила. Chromium, touch, 390×844 и
844×390; beige/light и black/dark. Все Supabase URL в этом проходе отвечали локальным
503: регистраций, приглашений, сообщений, публикаций и рассылок не было.

Evidence в workspace `tmp_files/ux-021/ux-walkthrough/`:
`report.json`, `followup-report.json`, `game-followup-report.json`,
`results-report.json`, `history-report.json` и пронумерованные PNG01–34.
Вспомогательные сценарии `/tmp/hod-ux-{walkthrough,followup,game-followup,results,history}.cjs`.
Это локальное незакоммиченное дерево, не release/artifact production.

## Что реально выполнено

- Root в непрямом порядке: Общение → Профиль → Мои партии → Игры → Общение;
  Чаты → другой root → возврат сохраняет выбранную вкладку.
- Локальная личность: изменить nickname/аватар → отмена не сохраняет; повторить →
  повернуть с заполненной формой → реальная кнопка Сохранить → root сразу актуален.
- Общие настройки из профиля не содержат account/identity; открытие/закрытие и
  последующий переход в Оформление не оставляют inert/root-blocker.
- Gallery theme/components, выбор UNO; dark → light; Данные device/cloud гостя;
  Паки installed/available; account signup пустая форма не отправляется.
- Список/2/3 каталога, фильтры; Домино → лобби → fullrules → раскрыть TOC → anchor
  → Back → settingsrules → Back → panel выбора места → Back → rotate → start.
- Реальное поле Домино, меню → настройки → возврат; обучение явно выбранным
  действием; меню → лобби → подтверждение остановки.
- Реальная короткая партия Крестики-нолики **кликами по доступным клеткам**, без
  присваивания finishedstate: естественный результат → history/replay → Back →
  В меню → Мои партии/История → заполненная запись → ⋯ действия.
- Во всех завершившихся browser-проходах `pageerror=[]`; screenshot checkpoints
  не показали document horizontal overflow. Это не заменяет проверку всей геометрии
  модалок/клавиатуры на physicaldevice или WebKit.

Примечание к сырым журналам: исходные03/04 и27/28 помечены FAIL.03 использовал
неверный селектор `form [type=submit]`: общий modal renderer выносит footer наружу
с корректным `form`-атрибутом.04 был заблокирован незакрытой формой.21/22 через
реальную кнопку Сохранить прошли.27/28 были заблокированы настоящим onboarding
«Обучение»; после явного «Без подсказок»29–31 прошли. Это ошибки очередности/локаторов
обхода, не доказанные дефекты продукта. Условия не прятались через forceclick.
Часть01–20 после03 осталась landscape; точный размер каждого PNG содержится в его
заголовке, поэтому не считать все эти экраны проверенными в portrait одновременно.

## Полное покрытие по ID приёмочной карты

| ID | Результат первого UX-прохода | Что ещё не доказано |
|---|---|---|
| A01 | PASS guest root sequence01; четыре назначения/нет orphan modal | Signed roots, systemBack physical |
| A02 | PASS11 виды/фильтры открываются; прежние geometry cases отдельно | Новая расстановка всех filledfavorites, reload/orderhide в этом обходе |
| A03 | **Разрыв:**12 открывает сразу lobby, отдельной shortmodepanel нет | На устройстве/Онлайн/Рядом до создания комнаты, cancel/loginreturn |
| A04 | PASS10 emptyHistory +34 naturalfinished card/⋯;33 replayreturn | Swipe карточки в filledlist, manyrecords, import/export/cloud/missingpack |
| A05 | PASS12/16 localDomino lobby и landscape;17 start;30 returnplaying | Online/nearby роли, autoStart и команды двумя людьми |
| A06 | Не выполнено в guest проходе: нет remotehuman | Self/other/spectator/table rights/hosttransfer |
| A07 | PASS15 panel место имеет явные bot/human/open/close | Botdifficulty save/cancel, locked/playing replacement |
| A08 | PASS14 editor открывается отдельно от чтения | Preset/teams validation, save/cancel, clients |
| A09 | Не выполнено: гостевой localroom не отправляет onlineinvite | Friends/group/search/share/error/receive |
| A10 | Не выполнено | Guest/closed/notfound/codepreview/active room |
| A11 | Не выполнено | direct/STUN/TURN/cancel/success0.5s/reconnect |
| A12 | Не выполнено | Wizard/QR/audio/permissions/two physicalphones |
| A13 | PASS30 actions комнаты +31 confirm surface | Close-room реальный cleanup/expiredinvite/roles |
| A14 | PASS17/20 actualDomino geometry modes;32 actualTicTacToe finished | Остальные реальнpackhands/actions, overlay stablebox allroles |
| A15 | PASS18/19 menu/settings return;30 lobbyreturn; **разрыв ниже** | Menu stop semantics, network actions/tempbot |
| A16 | PASS32 naturalresult +33 replayreturn; **разрыв roomreturn ниже** | Team/draw/revanche/online newhost result |
| A17 | Не выполнено, требует дваaccountclient | Offer/reject/accept/timeout whileplay/roles |
| A18 | Guest PASS01; отдельный A18 case PASS1/1 rows/swipe/read/reorder/play | Fullsignedsocial asyncstate, WebKit swipegeometry |
| A19 | Не выполнено в guest без auth | Search/requests/friendprofile/counters/notification |
| A20 | Не выполнено в guest без auth | Group create/info/edit/access/leave/invite |
| A21 | Неприменимо к localgame; прежний Table/teamcase отдельно | Новыйpanel full UX/rotate/keyboard на realnetworkgame |
| A22 | Не выполнено в guest без auth | Conversation history/unread/search/multiline/error/return |
| A23 | Не выполнено: код-критик переносит API и UI | После его freeze полный tap/swipe/reply/reaction/draft/return |
| A24 | Не выполнено в guest без auth | Active/accepted/transferred/offline/expired/counters withoutread |
| A25 | PASS09 guest signup browservalidation без externalrequest | Login/recovery/ratelimit/mode draft; optional-launch отдельный PASS |
| A26 | PASS02 cancel +21 save avatar/name/rotate/liveidentity | LocalAvatar accessibility, authuser contactdata |
| A27 | PASS22 cleanrootsettings;19 in-game open/close | Settings categories/options/reset/error acceptance |
| A28 | PASS05/06 landscapegallery;23/24 portraitdark/light | Все skins/семейства, choosing/reset/persistence |
| A29 | PASS07 device/25 cloudguest surface и возврат | Fileimport/export, realcloud/quota/conflict/remove |
| A30 | PASS08 installed/26 available и возврат | Install/update/error/offline/dependency/remove; не удаляли packs |
| A31 | PASS13 fullTOC anchor +Back;29 onboarding surfaced | Sticky underlongscroll, brieftxteditorial allpacks, WebKit/keyboard |
| A32 | Не выполнено: ни externalpush, ни syntheticnotice не отправлялись | Counterexpire, banners actionable/error and no scene shift |
| A33 | Не выполнено: нет полученного appupdate в localfixture | Карточка/install/progress/restart/error; не публиковать ради UX |
| A34 | PASS21 formrotate;16/20 lobby/game rotations; A18 swipe case отдельно | Chatgestures, reducedmotion, Android/iPhone keyboard/nativerotation |
| A35 | PASS09 browserinvalid + guest/dataempty surfaces, blockingtutorial обнаружен | Longloading/error/denied/cached/offline allscreens |
| A36 | PASS31 остановка показывает последствия;02 avatarcancel | Confirmaccept/delete/kick/close/error, full matching labels |

## Дефекты и несоответствия переданы владельцам

### UX-01 · Нет отдельного выбора способа игры (A03)

Repro: Игры → Домино. Получаем уже созданную локальную комнату, до выбора режима.
Выбранный shortgamecard должен показать На устройстве / Онлайн / Рядом, правила и
отмену до создания соответствующего сценария. Это влияет на ожидание результата
нажатия; оформление существующего lobbyradio не закрывает этот разрыв.
Владелец: root. Evidence12-domino-lobby.png. Не исправлял чужой appscope.

### UX-02 · Меню партии не содержит остановку (A15)

Repro: Начать Домино → выбрать обучение → Меню партии. Список: Комната, История
ходов, Пауза, Правила игры, Полный экран, Настройки. Остановка доступна только
после Комната → Действия с комнатой. В принятом коротком меню эта операция
должна быть доступна и подписана по своему реальному результату.
Владелец: root. Evidence18-game-menu.png.

### UX-03 · «Завершить» обещает финал, но действие сохраняет незавершённое (A15/A36)

Repro: В идущей localпартии → меню/Комната → Действия с комнатой →
«Завершить партию». Подтверждение сообщает «Сохранить партию и вернуться в лобби»,
«Её можно будет продолжить из Моих партий». Следовательно, действие — остановить/
сохранить, а не получить terminalresult. Назвать действительную операцию одинаково
в меню, лобби и confirmation. Не менять доменную семантику ради названия.
Владелец: root/UI. Evidence31-stop-confirm.png.

### UX-04 · Результат localпартии не предлагает возврат в лобби (A16)

Repro: Естественно закончить Крестики-нолики. CTA: «В меню», «Посмотреть историю»,
«Ещё партию». Выбранный flow предлагает «В лобби» и реванш. Если игра должна
оставаться той же комнатой, требуется прямой возврат; не заставлять пересоздавать
её через каталог. Сценарий replay→Back работает (33).
Владелец: root. Evidence32-tictactoe-natural-results.png.

## Следующий проход

Этот отчёт не заменяет `ACCEPTANCE-MATRIX.md`. После A23 провести affected-final:
T08–T11 с реальными двумя clients + T15 interruptions; повторить изменённые A03,
A15/A16 и связанные routes. UI-критик проверяет geometry обеих engines/ориентаций,
дизайн-критик сравнивает целые screens. A06/A09–12/A17/A19–24/A32–33 остаются
открытыми для appropriate fixtures/physicaltests. Полное «all screens done» до
этих проверок недопустимо. При исправлениях дописывать evidence ниже, сохраняя
первоначальные failures и их причины.


## Адресный повтор четырёх исправлений (35–42)

Реальное приложение Chromium390×844/844×390, внешние Supabase операции по-прежнему
заблокированы. Evidence: `gap-recheck-report.json`, PNG35–42, сценарий
`/tmp/hod-ux-gap-recheck.cjs`. Consoleerrors[], horizontaloverflowfalse.

| Проверка | Результат | Вывод |
|---|---|---|
|35 A03 card/order/no-room|PASS|Игра теперь сначала открывает shortchooser; hotseat/online/network в нужном порядке; room ещё null|
|36 A03 cancel|PASS|Возврат в каталог сохраняет вид3 и не создаёт комнату|
|37 A03 Rules→Back|FAIL|Правила открываются, но Back уводит в каталог: chooser не восстанавливается|
|38 A03/A25 online guest→authcancel|PASS|После отмены auth восстанавливается тот же chooser, room null|
|39 A03/A05/A31 device→rules→rotation→Back|PASS|Создание localroom после выбора; правила читаются; поворот; возврат в lobby|
|40 A27 prefs→gallery→Back|PASS|Полноценная поверхность оформления возвращает в settings, не root|
|41 A15/A36 stopmenu|FAIL по тексту|Команда в меню появилась, но ещё «Завершить партию», операция сохраняет незавершённое; подтверждение/отмена этим шагом не проверены из-за раннегоassert|
|42 A16 result→lobby|PASS|Реальная естественная партия; CTA «В лобби» работает и открывает lobby|

Обновление старых gaps: UX-01 закрыт по chooser/no-creation/cancel, но требует
вложенного Rules→Back (37); UX-02 команда stop в меню добавлена, текст/confirm ещё
принять; UX-03 старое неточное название остаётся; UX-04 прямой возврат lobby закрыт
для проверенной localTicTacToe. «Ещё партию» rematch-start в этом повторе не нажат,
поэтому начало нового матча не приписывать проверке42. Новые результаты не закрывают
авторизованные/сетевые и A23 сценарии из общей карты.

## Повтор после исправления двух оставшихся путей (43–45)

`gap-final-report.json`, PNG43–45; `/tmp/hod-ux-gap-final.cjs`; Chromium390 touch,
локальная realappfixture, Supabase503, consoleerrors[].

- **43 PASS A03/A31:** gamecard → Правила → Back восстанавливает chooser; room null.
- **44 PASS A15/A36:** actual меню содержит «Остановить партию»; по нажатию открывает
  подтверждение; отмена возвращает существующее поле без остановки партии.
- **45 PASS A16:** естественно завершить реальную TicTacToe → «Ещё партию» →
  новый startLobbyCountdown заканчивается playingroom + tableShell без resultmodal.

Четыре исходных UX-разрыва закрыты в проверенных localмаршрутах: режим/card и
вложенный Back, остановка в меню и правильное название, прямой lobbyreturn,
отдельный немедленный rematchstart. Onlineварианты и A23 ожидают отдельной приёмки.


## Checkpoint longsocial перед структурной переработкой

Работа остановлена по указанию владельца/root; финальнойприёмки нет. Изменён только
longsocial block и устаревшие accountcases в `tests/cloud-account-browser.test.cjs`;
optional-launch не менялся. Код-критик разрешил владение этимфайлом; A23 он делает
в другихfiles. Реальныхcloudопераций не было: все RPC проходили existingroutefixture.

- Longsocial дошёл через accounts/nickname/friendrequest/accept, profile/draftreturn,
  quickreactions/multiline/escaping/send, filledfriends, online lobby/inviteпароль/
  share/decline/accept и link connection.
- Найденный реальный friendprofile buttonoverlap исправлен UI-критиком вCSS.
- Найденный реальный rootCommunity.show за старымmodalbackdrop исправлен в
  `community-ui.js`: rootfallback закрывает прежнююмодалку; explicithost renderHub
  сохраняет текущую внешнююповерхность. Этотфикс позволил сценарийпродвинуться.
- Последний прогон: FAIL после44.9s из-за устаревшего `.table-tools [data-command=settings]`
  в созданном игровомокне, строка258. Селектор заменён на фактическое менюпартии→
  settings, **послеэтойпоследнейправки повтор не запускался**.
- Лог `/tmp/hod-long-social.log`, runner evidence
  `dist/test-results/case-cloud-account-browser-cloud-social--fixed-account-prefix-network.log`;
  PNG в `tmp_files/ux-021/auth-walkthrough/`. Старый210s timeout в достигнутойчасти
  не воспроизведён; весьтест до конца не прошёл и проблема не считаетсязакрытой.
- Другие cloud-accountcases переведены на helper openProfileAccount (настоящая
  навигация/startupформа); удалён тест несуществующего compactsettingsicon вместо
  проверки visiblebusy/error/retry/profileidentity/reload/offline. Новаяверсияэтих
  cases ещё не запускалась; итоговогоgreen этогофайла нет.
- Диагностические `console.log('social phase: ...')` оставлены намеренно для
  продолжения: accounts ready / friendship ready / room lifecycle / unknowncontact /
  groups / grouperrors. Убрать после устранения оставшихсяблокировок.

Следующийэтап — структурнаяпереработка по утверждённому прототипу, не продолжение
визуальнойприёмки legacyэкранов. Послеэтого сохранить эти behavior assertions,
актуализировать маршруты и выполнить scopedфинальный проход.

## 02.11.2026 · возобновлённый account/social scope

Это **поведенческая**, а не визуальная приёмка всей0.21. Все36экранов этимфайлом
не покрываются. Реальные Auth/RPC/UI adapters и serviceworker сохранены;
серверные responses поставляет локальная fixture, не production.

### Изоляция и границы доказательства

Первый route-only WebKit запуск был отвергнут как небезопасная/недоказанная
изоляция: при SWcontrol WebKit способен обойти Playwright context.route.
Он завершился на первомlogin, до регистрации/приглашений/сообщений. Его результат
не используется как доказательство работы и не подтверждает отсутствие nativeAuth.
Последующие WebKit/Chromium проверки используют `accountSyncRoute.installFetch`
до nativefetch, без выключенияSW; `afterEach` проверяет positiveinterceptedcount
у provider-сценария и `nativeSupabaseRequests===0`. Неизвестная fixture-response
не переключается на реальныйbackend. ProductionDDL, настоящихрассылок и
публикаций не выполняли.

### Результаты и evidence

| Проверка | Chromium | WebKit | Точный scope |
|---|---|---|---|
| Полный `case/cloud-account-browser`,16tests | **PASS16/16** | Первоначально14/16 | Все7auth/password/recovery/late-error, longsocial, cache, counts/expiry, registration/friendbanners, A23 |
| `chat navigation:` послеисправления fixture | PASS1/1 | PASS1/1 | Invitations/navigation/anchor/bottomtracking; реальные стартовые prerequisites |
| `chat unread boundary` послеисправления fixture | PASS1/1 | PASS1/1 | Unreaddivider visibility, nojump при чтении старого |
| FinalA23 `cloud message UX:` послепоследнего ACKfix | PASS1/1 (код-критик) | PASS1/1 (код-критик) | DM/group attachedreactions; reply/cancel; body+quote draft; successfulsendclear; heldACK→capturereturn→silentclose→resume |

WebKit14/16 + дваадресных успешныхповтора не выдаются за одинповторный full16/16run.
Два начальныхпадения были race **fixture**, а не ослаблением assertions:
`browser.newPage()` не seedит localprofile; startup «Как вас называть?» мог
перекрыть программнооткрытый mockchat. Снимок `/tmp/hod-chat-navigation-webkit-failure.png`
показывает именно startupform, countmessages0/currentchatnull/cache38. Теперь оба
microcase сначала завершают реальный localnameform, затем проверяют прежние
позициипрокрутки. Chromium тоже повторён адресно после этогоизменения.

Evidence в workspace:

- `tmp_files/ux-021/account-social-final-chromium/account-social-test.log`;
  `chat-navigation-test.log`, `chat-unread-test.log` рядом.
- `tmp_files/ux-021/account-social-final-webkit/account-social-test.log`;
  `chat-navigation-test.log`, `chat-unread-test.log` рядом.
- PNGсостояния auth/friend/group/invite/notification и
  `cloud-{dm,group}-reply.png` в соответствующихenginefolders.
- `tmp_files/ux-021/chat-actions/final-draft-acceptance.json` — код-критик зафиксировал
  последний scoped A23 повтор после reconciliationfix.
- Старый Chromium routefixture longsocial PASS193.56s сохранён отдельно в
  `auth-current-chromium/social-test.log`; safeWebKit longsocial PASS51.02s в
  `auth-safe-webkit/social-test.log`. Лимит210s не увеличивали. Старый timeout
  теперь заменён завершившимсядо конца сценарием и явной временнойдиагностикой,
  но ни один timeout не считалсяPASS.

### Реальные найденные и исправленные проблемы

- Подписанные friend/participant действия наследовали ширину iconbutton и
  перекрывали другдруга. UI-критик исправилlayout; remove/cancel→chatdraftreturn
  теперь проходит реально кликом, безforceclick.
- `CommunityUI.show()` при выборе rootfallback мог оставить старый modalbackdrop
  поверхкорневогосписка. Исправлено в community-ui; explicithost renderHub не
  закрывает чужоеокно. Это не заменяет отдельную задачу полноценного panelstack.
- A18 приведён к принятому порядку **Чаты / Друзья**, default**Чаты**, с сохранением
  выбраннойвкладки. Friend/group tests переходятвДрузья явно.
- A23 DMreplydraft терялся при headerClose из-за сохранения после удаленияDOM.
  Исправлено код-критиком через немедленное сохранение текста/цитаты и ownerguards.
  LateACK очищает только совпадающий отправленныйdraft, включая nestedresume;
  assertions сохранены в новом shortcase.

### Открытый fidelity-дефект UX-05: подложка панели

Fresh `friend-profile.png` показывает панельдруга над каталогом, хотя она открыта
из общения/разговора. Backлогическивосстанавливает правильныйконтекст, но видимый
родительский full-screenmodal заменяется при открытии панели. Дизайн-критик
подтвердил: acceptedpanel должна накрывать текущийэкран. Это общий panelstack/
surfaceownership вопрос; CSSedgeattached не исправляет потерюподложки. Передано
root+дизайнеру; здесь не закрыто и не замаскировано поведенческимPASS.

### 02.11: структурная ревизия подключения / A18 grouping / A19 underlay

Подробный текущий backlog: `UX-STRUCTURAL-REVIEW-02.md`, A09/A10/A12/A29/A30
с точными presenter-функциями и выбранными reference. Независимые свежие A02
Cancel/подложка и DM/group native DOM/draft/scroll return — Chromium/WebKit;
intercepted=11/native=0/pageerrors=[], PNG в `structure-review/*-fresh-*`.
Весь group-info layout этим не принят: это fullscreen, а не видимая DM-подложка.

Runtime A18: группы/create в Чатах; Друзья — люди; локальный поиск и no-results;
сохранение mixed order при редактировании разных вкладок; group refresh/error/alias
перенесены. `case/community-actions-browser` (quick actions) PASS1/1 Chromium,
PASS1/1 WebKit. Свежие реальные Auth/RPC fixture PNG —
`structure-review/*-social-{chats,friends,search}-grouping-*`, native provider=0.
Визуальная разница toolbar/icon-only Add не объявлена принятой.

GroupInfo: self label «Вы» через optional explicit FriendCard status. Selected
`group members distinguish` PASS1/1 Chromium, PASS1/1 WebKit, проверены self/friend/
other и безопасный provider. Это не проверка реального облачного изменения или
создания группы, не production рассылка и не финальная all-A приёмка.
