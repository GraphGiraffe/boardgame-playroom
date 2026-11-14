> Актуальная трассировка A01–A36 и поздние изменения владельца: [CURRENT-IMPLEMENTATION-1111.md](CURRENT-IMPLEMENTATION-1111.md). [Оболочка исторического сравнения](../../../tmp_files/ux-021/fidelity/current-review-1111.html) явно отделяет снимки 2 ноября от preview.70; оригинальные PNG, choices и viewer сохранены.

# Строгое соответствие утверждённому прототипу 0.21

02.11.2026. **Все предыдущие visual accepted/PASS отозваны владельцем.**
Функциональная доступность и удачное отсутствие overflow не доказывают перенос
дизайна. Старый каркас с подписями/скрытыми кнопками не является выбранным UI.

## Как читать этот документ сейчас

Это исходный контракт переноса и журнал отозванных промежуточных решений.
Фразы «переносит»/«нужен свежий actual» в исторических разделах ниже относятся
к моменту их записи. Текущие реализации и доказательства: ACCEPTANCE-MATRIX.md,
DESIGN-ACCEPTANCE.md, FINAL-UX-REVIEW-NOW.md и ROOT-FINAL-REVIEW.md. Не считать
историческую таблицу ни актуальным списком незавершённых задач, ни общим PASS.

## Источник истины и артефакты

Источник: неизменённый `tmp_files/ux-021/connected-prototype/owner-decisions-7.json`
(36 choices), runtime связного `prototype-v1.html` и последующие уточнения владельца.
При расхождении поздние инструкции важнее: порядок На устройстве/Онлайн/Рядом,
квадратные каталожные карточки, режимы вида с «В комнату» в одной строке,
старые палитра/иконки/реальные игровые renderer и механики сохраняются.

Сняты **72 approved reference**: `tmp_files/ux-021/fidelity/reference-{id}-{390,844}.png`,
390×844 и 844×390. Скрипт `/tmp/hod-reference-capture.cjs` запускает настоящий
автономный HTML и `HODPrototype.enter(id)`, не воспроизводит макет по памяти.
Внешняя демонстрационная toolbar, fake OS statusbar, рамка устройства сняты
из capture. Внутренний header/body/footer и выбранные варианты не менялись.

- `tmp_files/ux-021/fidelity/prototype-vs-runtime.html`: автономный HTML со всеми36
  выбранными экранами, портретными reference и датированными runtime где доступны;
- `tmp_files/ux-021/fidelity/contact-sheet.png`: 6 ключевых пар для быстрой ревизии;
- `tmp_files/ux-021/fidelity/choices.json`: точный ID/variant/name источника.

В HTML исторические runtime явно помечены. Для landscape runtime рядом добавлен
reference844×390; не сравнивать его с растянутым portrait. После новой правки
снимать тот же путь/состав/viewport заново, а не переносить прежнюю приёмку.

## Высокий приоритет: замена каркасов

1. **Settings A27:** вариант2 = отдельный экран с back header, вкладки
   Звук/Поведение/Доступность, содержимое выбранной категории и контекстные (?).
   Не длинная страница всех старых controls под заголовками и не toolbar shortcuts.
   Root переносит. Для приёмки нужны три отдельные вкладки в обоих ориентациях.
2. **Lobby A05:** выбранный `roomBody`: summary с артом/игрой/mode+code+host и
   Правилами; «За столом»; одинаковые компактные people rows; Пригласить;
   Автостарт; причина ожидания; Доступ и настройки; закреплённая Готовность.
   Не slots grid/синие mode tabs/массовая сложность на первом экране.
   UI-инженер переписывает. Invite идёт ПОСЛЕ людей, прежний мой совет ДО отозван.
3. **Общий каркас поверхности:** root и полноценные разделы — экран с единым header
   и scroll-body; выбранный контекстный sheet — поверх фона с ручкой и коротким
   набором действий. Legacy центрированный rounded dialog нельзя универсально
   переименовать в «панель» и объявить перенесённым. Меню/состояния не сдвигают игру.
4. **Profile A26:** identity сразу после шапки, затем единые строки Настройки,
   Оформление, Данные и облако, Игры и обновления, Обновление ХОД, Уведомления.
   Гость/авторизованный вид меняют доступные данные/действия, не структуру раздела.
   Служебные полноэкранность/порядок игр не заменяют эти основные направления.
5. **Results A16:** полноценный итоговый экран: итог/краткий контекст, результаты
   участников, закреплённые В лобби/Ещё партию. Не старый центральный dialog с
   двумя несвязанными кнопками История/В меню. Типовые счётчики берутся из renderer.

Это сравнение с просмотренными approved reference и историческими runtime
`ux-walkthrough/12,22,32`, root-profile. Оно определяет цель переписывания;
не утверждает, что параллельные новые изменения этих авторов уже проверены.

## A28: исправлен собственный неверный перенос

Первый мой вариант A28 (центрированная modal, две вкладки, немедленное применение)
тоже не соответствовал reference. Он заменён в `appearance-ui.js/appearance.css`:
full-page back header → Тема/Колода/Арты → галерея → закреплённые Отменить/Применить.
Карточки используют существующие Light/Dark и реальные арты, без выдуманных
пресетов Сад/Песок/Сумерки; это следствие указания сохранить старую палитру.
Неподдерживаемое следование теме устройства не добавлено декоративным fake toggle.
Выбор темы/скинов — черновик; Apply сохраняет, Cancel оставляет прежние значения.
Старый instant-toggle API вне галереи сохранён для совместимости существующих callers.

Адресный existing case обновлён для реального пути Профиль→Оформление:
`node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery previews named skins'`
**PASS1/1**: 6 реальных face variants/2group, draft до Apply, persistence после,
Cancel сохраняет прежнее, ширины360/390. WebKit с настоящим SW (безblock)
прошёл выбор/Apply/reopen; actual-appearance-390.png переснят из final Chromium.
Это проверка A28, не принятие всех36 и не physical iPhone.

## Контракт сравнения каждой оставшейся поверхности

Для каждого ID нужен свой actual runtime кадр, а не доказательство наличия кнопки.
Проверять: тип поверхности; порядок крупных блоков; вкладки/rows/главное действие;
место footer и прокрутки; плотность и размеры; реакции на поворот/клавиатуру;
переход/Back без потери контекста. Отличия количества реальных игр/людей и палитры
допустимы по данным/указаниям владельца; замена структуры — только по его решению.

| ID | Точно выбранный вариант | Статус строгой визуальной сверки |
|---|---|---|
| navigation | 0 · Четыре назначения | Нужен свежий actual после переписывания |
| catalog | 0 · Чипы + панель фильтров | Нужен свежий actual после переписывания |
| gamecard | 0 · Короткая панель | Нужен свежий actual после переписывания |
| saved | 0 · Активные / Архив | Нужен свежий actual после переписывания |
| lobby | 0 · Список + нижнее действие | Нужен свежий actual после переписывания |
| participant | 0 · Нижняя панель действий | Нужен свежий actual после переписывания |
| bots | 0 · Свободный слот → выбор | Нужен свежий actual после переписывания |
| rules | 0 · Пресет + подробности | Нужен свежий actual после переписывания |
| invite | 0 · Вкладки + поиск + Поделиться | Нужен свежий actual после переписывания |
| join | 0 · Код + превью | Нужен свежий actual после переписывания |
| connection | 0 · Один статус + подробности | Нужен свежий actual после переписывания |
| nearby | 1 · Мастер двух телефонов | Нужен свежий actual после переписывания |
| roomsettings | 1 · Короткая панель | Нужен свежий actual после переписывания |
| game | 0 · Действия внизу · выдвижной чат | Нужен свежий actual после переписывания |
| gamemenu | 0 · Короткая панель действий | Нужен свежий actual после переписывания |
| results | 0 · Итоговый экран | Нужен свежий actual после переписывания |
| transfer | 2 · Уведомление → панель по нажатию | Нужен свежий actual после переписывания |
| social | 0 · Чаты / Друзья | Нужен свежий actual после переписывания |
| friends | 2 · Профиль в sheet | Нужен свежий actual после переписывания |
| groups | 1 · Одна форма | Нужен свежий actual после переписывания |
| chat | 0 · Панель снизу, две высоты | Нужен свежий actual после переписывания |
| conversation | 0 · Один экран разговора | Нужен свежий actual после переписывания |
| message | 2 · Тап: реакции · свайп влево: ответ | Нужен свежий actual после переписывания |
| invitecard | 0 · Карточка внутри сообщения | Нужен свежий actual после переписывания |
| account | 0 · Экран с понятным режимом | Нужен свежий actual после переписывания |
| profile | 0 · Профиль как раздел | Нужен свежий actual после переписывания |
| settings | 2 · Вкладки категорий | Нужен свежий actual после переписывания |
| appearance | 1 · Галерея образцов | Новый target каркас снят; полная приёмка открыта |
| data | 1 · Вкладки Устройство / Облако | Нужен свежий actual после переписывания |
| packs | 0 · Установлено / Доступно | Нужен свежий actual после переписывания |
| help | 0 · Кратко / Полностью | Нужен свежий actual после переписывания |
| notifications | 0 · Верхний баннер | Нужен свежий actual после переписывания |
| update | 0 · Карточка обновления | Нужен свежий actual после переписывания |
| gestures | 1 · Жест + явная альтернатива | Нужен свежий actual после переписывания |
| states | 0 · Встроенный статус | Нужен свежий actual после переписывания |
| confirm | 1 · Панель последствий | Нужен свежий actual после переписывания |

### Первый новый A05 pair

Просмотрен `fidelity/application-lobby-390.png` рядом с нормализованным reference:
новый full-page каркас, summary, одинаковые compactpeople, приглашение, автостарт,
доступ и pinned ready соответствуют выбранному roomBody по иерархии. Это заменяет
исторический lobby в contact-sheet/HTML; не означает принятие всех ролей/поворотов.

Открытый вопрос: «Свободные места» отдельным disclosure. Нельзя прятать единственный
вход к свободному слоту внутрь настроек только для совпадения с demo-составом:
A07 выбран как «Свободный слот → выбор», владелец просил нажимать всю пустую строку.
Рекомендация — компактная видимая empty-person-row при наличии свободного места;
её наличие определяется реальными данными комнаты. Не возвращать прежний slotsgrid.
Вопрос передан ведущему и UI, окончательная компоновка ещё не зафиксирована.

## A26 — новый профиль, ограниченный подтверждённый scope

Профиль переписан по reference: identity/editprofile, шесть спокойных rows,
auth footer. Постоянные fullscreen/order/theme и дубли имён/аватаров удалены.
Авторизованный footer имеет Аккаунт/Выйти (ведущий согласовал дополнительный вход
к реальным email/password/username), гость — Войти. Identity action остаётся
profile-edit; account не подменяет его после загрузки. Footer обновляется по
identity event через один profileAuth() без remount identity button.

Chromium: фактический UI login через локальный auth fixture → signed profile;
guest/account,390×844/844×390,6rows,identity editor,nooverflow/no pageerror — PASS.
WebKit: guest portrait/landscape снят; signed fixture дважды завершился
account.error=credentials (local/busyfalse); это **не PASS**. Передано код-критику
для расследования маршрутизации fixture с настоящим SW. Тест не обращается к
настоящим пользовательским аккаунтам. Coder подключает logout confirmation hook.

Actuals `fidelity/actual-profile-{guest,account}-{390,844}-{engine}.png`:
Chromium все4, WebKit только2guest на момент записи. Попарный HTML обновлён.
Визуально выявлены и исправлены неверные имена иконок right→next/game→gamepad;
кадры до исправления пиктограмм исторические, требуют final recapture.

Оставшееся за пределами profile functions: на844root включал старый desktop
sidebar вместо bottomnav выбранного landscape reference. Передано ведущему для
унифицированного решения всехroots, не исправлять отдельнымprofileoffset.

### A27 — сверка нового каркаса

Просмотрены application-settings-sound390/behavior390/accessibility844 с reference2.
Полноэкранная структура/три вкладки/единственная выбранная категория/quiettoggles/
reset соответствуют. Открыты сквозные различия: header28px vsreference20px;
landscape содержимое max640 по центру vsreferenceviewportinsets. Решение ведущего
должно применяться ко всем fullpages, не отдельным браузерным патчем.

## Остаток всех36 после текущих замен

Свежая строгая приёмка ещё нужна каждой группе; ниже не маскируем отсутствие пары
утверждением о соответствии. Старые behavioral PASS не закрывают строки.

- A01/02/04: catalog/chips/filter sheet; root bottomnav в mobile landscape;
  compact saved entries/swipe actions. Новая структура истории функционально есть,
  полный populated exactpair ещё не снят.
- A03: short mode sheet + art + signed mode rows. Поведенческий walkthrough уже
  показывает новый screen; final sameviewport pair нужен после последних edits.
- A05–13: lobby новый; participant/bot/rules/invite/join/connection/nearby/roomsettings
  требуют отдельных пар. Критический образец: participant sheet = identity +
  подписанные Написать/Передать/Исключить rows, не нижняя полоса загадочных иконок;
  invite = tabs/search/selection/share, nearby = мастер двух телефонов.
- A14–17: реальная игровая геометрия по поздним указаниям, но menu/results/transfer
  должны иметь собственный выбранный каркас: short sheet; full results + pinned
  Влобби/Ещё; пассивный banner→tap panel. Старые toolbar/menu dialogs не засчитывать.
- A18–25: social tabs/списки, friend sheet, group single form, chat twoheights,
  conversation fullpage, anchored reaction popup/reply, invitation inmessage,
  account fullpage modes. UX сообщил actual groupinfo всё ещё содержит старые
  friend-profile identity + social-list + icon-only leave/add strip: нужна отдельная
  замена на подписанные действия/детали, не косметическое переименование.
- A26–30: профиль/галерея/settings новые, ограниченные результаты выше. Data tabs
  и quota/progress, packs tabs/card download/update требуют свежих paired actuals.
- A31–36: brief/fullrules stickyTOC, topnotifications, updatecard, gestures,
  inline states, consequences confirmation — нужны specific state pairs, включая
  motion/press/release. Одна статичная пустая страница не покрывает эту группу.

A26 follow-up: final Chromium кадры пересняты после исправления пиктограмм и
profileAuth/updater (теперь футер тоже получает signedstate без remount identity).
Третий диагностический WebKit прогон с context.route вместо page.route дал ту же
credentials-ошибку до signed UI. Альтернативный способ перехвата не исправил
фикстуру; дальнейшее расследование передано код-критику. WebKit signed остаётся
непроверенным, даже если остальные WebKit root кадры выглядят корректно.

## Независимый повтор root shell и Settings

Пересняты `actual-root-{games,sessions,social,profile}-{390,844}-{chromium,webkit}.png`
новым `/tmp/hod-root-fidelity.cjs`. Оба движка:8rootstate + rail1100×600 — PASS
по bottomnav/rail/overflow/pageerrors; fixture fetch port failclosed,
nativeSupabaseRequests=0, realSW не отключался. Это измерения, не все36 visualPASS.

Просмотрены profile390/844, social390, catalog390, sessions390 попарно с reference.
Root844sidebar устранён: bottom4nav на телефоне в обеих ориентациях. Profile20px
header, identity,6rows/auth теперь структурно воспроизводят выбранный профиль.
Desktoprail разрешён только roomy>=1100×600. Settings заново сняты:6checkpoints+
preferences ChromiumPASS; max640 снят, header20, выбранная категория/контекстные(?),
compacttoggles и reset соответствуют выбранному каркасу.

Остатки именно свежего кадра:
- A04 пустое состояние сохраняет старую большую filledcard/крупный primaryCTA.
  Reference — короткий unboxedцентрированный заголовок и outline«Выбрать игру».
  Постоянные импорт/удаление вторичны, не должны заново создавать legacydashboard.
- A18 фактический порядок вкладок Друзья/Чаты, defaultДрузья. В выбранном reference
  Чаты/Друзья, основной online/social вход — разговоры. Это не палитровая разница.
- A02 поздние однорядные controls/squarecards/favoritetopright соблюдены. Остался
  legacyhero воздух/более крупный шрифт относительно reference; проверить компактный
  rhythm перед каталогом, не возвращать старую многословную шапку.

### A08 независимая визуальная проверка

Просмотрены `rules-021/chromium-domino-390.png` и `webkit-domino-844.png` с reference.
Новая hierarchy summary/reset→details→fixedSave соответствует варианту0. На момент
снимков ещё были max640центр в844, footerinset34vsreference12 и legacyкрупныйcheckbox
«Открытые руки» вместо compactpill. Это передано UI для исправления;9functional
checkpoints не считаются визуальным закрытием этих различий. Дополнительные реальные
параметры/summaryвысота по данным сами по себе не являются ошибкой дизайна.

### A26 WebKit уточнение: безопасный повтор успешен

Код-критик установил причину route-only authfailure: SW-controlledWebKit обошёл
HTTProutefixture и отправил неуспешный fake-tokenPOST400. Успешного входа/мутации
не было. Этот способ повторять нельзя. Новый reusable
`accountSyncRoute.installFetch(context,wrappedHandler)` перехватывает только
Supabasefetch до native networking, оставляя UI/Authadapter/реальныйSW.
`profile-webkit-auth-evidence.json`: PASS guest/signed2orientations,6destinations,
identityeditor,nooverflow/pageerrors; intercepted4,nativeSupabaseRequests0.
Это закрывает прежний ограниченный fixtureblocker, не доказывает работу liveprovider
или physicaliPhone. Logout hook подключён код-критиком к общему confirm/identityguard.

## A04 empty/tools и A02 hero: адресный перенос

Saved empty-state заменён на выбранный: короткий unboxed h3 + outline CTA с
gamepad; История — короткое пояснение. Служебные импорт/данные-экспорт/удаление и
транспортные фильтры доступны в quiet disclosure после списка, не конкурируют
с основным действием. При включённом фильтре управление раскрыто, поэтому возврат
ко всем записям не прячется. Экспорт ведёт в реальный экран Данные с existing
per-entry export; фиктивного «экспортировать всё» не добавлено.

Hero каталога:26px и плотность по reference, поздние квадратные карточки/favorite
и controls одной строкой сохранены. Scope правок: savedGamesMarkup и scoped
hub-shell-021.css; shared filledsessionCard/transport/import/delete реализации
не переписаны и не считаются полностью перенесёнными по этому emptycase.

`case/rc2-hub-browser`: PASS1/1. `/tmp/hod-root-fidelity.cjs`: Chromium/WebKit,
8rootstates+rail+доступностьИмпорт/disabledУдалениепустого/реальныйДанныеmodal — PASS;
realSW включён, nativeSupabaseRequests=0. В первом дополнительном probe использован
ошибочный селектор cloud-data-modal вместо storage-data-modal; после исправления
локатора повтор прошёл. Это не скрытый продуктовый сбой.

Свежие actual-root-sessions390 и actual-root-games390 просмотрены попарно. Прежние
замечания о большом filledemptycard и hero30px закрыты в показанном состоянии.
Filledrecords/swipe/cloud и другие состояния A04 остаются в полной приёмке.

## A16 — независимая сверка нового результата

Просмотрены `solitaire-layout-v4/result-{390,844}.png` и свежие
`fidelity/application-results-webkit-{390,844}.png` рядом с reference-results.
Fullscreen header→summary→typed result person rows→quietHistory→fixedfooter
соответствует композиции A16. Одна реальная победа Косынки/715/52карты не обязана
изображать двух демонстрационных игроков Домино; реальные типизированные метрики
сохранены. На844 история находится ниже fold и доступна прокруткой, footer виден.
В новых WebKit кадрах footericons уже присутствуют.

`results-webkit-report.json` подтверждает historyReturn/roomReturn, footerx12,
width366/820 и nooverflow. Это ограниченный single-playerwin/двеориентации scope;
team/draw/quit/publicTable/newhost results требуют своих состояний, общий A16PASS
не выставляется только по этому кадру.

## Единый целевой контракт generic contextual panels

Это точные выбранные поверхности A03 gamecard, A06 participant, A07 bots,
A36 consequences-confirm; они **не** центрированные диалоги и не floatingcards.

| Часть | Утверждённый target |
|---|---|
| Привязка | bottomedge0, horizontal0, width100% на390×844 и844×390 |
| Форма | radius24px24px00; нижний/боковой gap0; тень сверху |
| Высота | по содержимому, max-height calc(viewport-40px), не фиксированные90% |
| Handle | полноширинная зона min44px, visual38×4px, без собственной рамки |
| Header | title18px, справа подписанное Закрыть44px, горизонтальныйpadding16 |
| Body | padding16, вертикальныйgap12, min-height0, собственныйscroll |
| Scrim | весь webviewport; fakeOSoffset26px из demo не переносить |
| Подложка | фактически открытый screen/game/chat остаётся на месте, inert |
| Закрытие | Back/Escape/Close/gesture снимает только topnode, возвращаетfocus/scroll |
| Motion | однократный smallbounce200–260ms, reducedmotion; не bounce каждогоpatch |

A03 внутри — gameart + signedmode rows (поздний порядок На устройстве/Онлайн/Рядом)
и Как играть. A06 — identity и подписанные chat/transfer/kick rows; A07 — difficulty
choices + save/remove; A36 — последствия + спокойная Отмена/опасное подтверждение.

**Исключения из genericpanel:** A33 Update в reference — полноценная страница с back
header, updatecard, status/progress и prepare/apply CTA. Её нельзя отправлять в
bottomsheet вместе с подтверждениями. Gamechat/gamemenu имеют собственное выбранное
adaptive-right поведение; это не правило всех landscape panels. Anchoredmessage
reactions — собственный popup у сообщения, не нижняя панель.

UX выявил фактический A19 gap: friendprofile из conversation заменяет modal-root,
подложкой становится каталог. Это требует общего layer/stack сохранения текущего
screen DOM, не исправления одного border-radius. Новый panel должен накрывать
существующего родителя; закрытие не пересоздаёт conversation и не теряетчерновик.
Требование передано ведущему до выбора единой реализации; runtime lease на такую
архитектуру у дизайнера отсутствует.

A08 final follow-up: просмотрены обновлённые ChromiumDomino390 и WebKitLudo844.
Max640/footerinset/legacycheckbox устранены: bodyfullwidthx12, footerx12,
Открытыеруки —compactpill. Прежние конкретные visualdeltas закрыты в этих кадрах.
Новый interactionвопрос передан ведущему: categorical Режим/Завершение партии
пока представлены legacyenumslider со скрытыми вариантами. Select/segmented
объясняет варианты заранее; numeric values могут оставаться range. Это не отменяет
соответствие нового summary/details/footerкаркаса и не требует нового дизайнварианта.

## Независимая сверка общего panelregistry и A02 filters

Прочитаны SURFACE-STACK.md/PANEL-STACK-IMPLEMENTATION.md. Просмотрены новые
panel-stack/chromium-confirm390,webkit-confirm844, реальный
final-ui-rtc/chat-participant-underlay.png. Прежние bottom8/landscapecenter/gap
устранены: обычные панели edgeattachedfullwidth в обеих ориентациях, handle есть,
родительский chat/game виден подscrim. Реальный connected/inert/restoreDOM доказан
UIRTC13checkpoints, не только наличием обёртки. A36 consequences/body/footer
порядок верный; опасное действие использует старую реальную palette.

Открытые точные отличия:
1. Header все ещё показывает Закрыть слева, заголовок справа. Selected reference
   во всех ordinary sheets — заголовок слева, Закрыть справа. Исправить общим
   порядком headerchild, не отдельным A02/confirm offset.
2. Сильное размытие подложки в390 отличается от чёткой dim-подложки reference.
   Реестр сохраняет исходный контекст, но blur визуально затрудняет его распознание.
   Передано ведущему как общий стилевой вопрос, не подмена layoutподбраузер.
3. RTC participant кадр содержит identity без разрешённых actionrows. Он доказывает
   underlay, но не full A06 action hierarchy; нужен разрешённый host→human случай.
4. Старый account-social-final-webkit/friend-profile.png предшествует registry;
   floatingframe/catalogunderlay на нём нельзя приписывать новому runtime.
   У UX запрошен fresh DM→friend кадр вместо повторения целого walkthrough.

A02: сняты отдельные approved reference-filter390/844 из connectedprototype dialog
и actual-filter-{390,844}-{chromium,webkit}.png. Оба движка — draft не меняет число
карточек до Apply, Cancel сохраняет состояние; nativeSupabaseRequests0/realSW.
Три primarychoices и rare details соответствуют переносу существующих функций.
Фильтр теперь отдельная контекстная поверхность; прежняя inlineпанель устранена.

Помимо общего reversedheader, actual panel заметно выше reference: повторное
«Число игроков», rare details и свободные отступы/линия передfooter. Rare controls
должны сохраниться, но legend дублирует самоочевидные threechoices; уплотнение
передfooter возможно без изменения выбора или потери функций. Root уведомлён.

## Fresh A19 и A09 follow-up

Просмотрены `structure-review/webkit-dm-underlay-fresh-{390,844}.png`:
исходный разговор теперь под панелью, а не каталог; edgeattachment в обеих
ориентациях; title слева и Close справа. Прежние underlay/header замечания закрыты
в этом новом кадре. UI/UX сообщают Back возвращает исходный connectedDOM/editor/
scroll/draft, не реконструкцию. Остаточная плотность: между identity и actionrows
у friendprofile заметный большой зазор, общий quietrows rhythm предпочтительнее.
Группа открывается полноценным экраном, не fakepanel; это само по себе верно.

A09: независимо просмотрены invite-friends390/selected844, Link390/844 иAccess390
из `invite-021` вместе с reference-invite. Summary→3tabs→поиск→selectionrows→count/
send→fixedBack совпадают с выбранной структурой. DisabledSend при нулевом выборе
является фактическим состоянием, а не ошибкой дизайна. Headergap844 примерно13px
больше reference, устранение должно быть общим, не индивидуальным offset.
Link844 снят уже прокрученным к действиям; отсутствие верха в этом кадре не считается
багом. Link содержит реальный URL/code/share/copy в пределах поверхности.

Access390 использует правильный вложенный edgepanel. Остаточныйclutter:
PasswordOFF всё ещё показывает masked------ и disabledchange/copy; предложение
скрывать только passworddetails доON передано UI. Это не блокирует новый A09каркас.

**Отдельный незакрытый A20:** fresh group-underlay390 всё ещё показывает большой
filledmembercontainer почти дониза, squarecheckbox history и icon-only leave/add
полосу внизу. Selfmember ошибочно «Не в друзьях». Последнее UX уже передал владельцу;
выполненный A09 не закрывает A20. Нужна ревизия подписанных действий/плотности и
общих переключателей, сохраняя настоящий состав участников и разрешения.

A02 final repeat after sharedCSS/header changes: обаengine снова сняли390/844 и
прошли draft/Cancel. В новых actual-filter кадрах titleLEFT/CloseRIGHT и чёткая
 dimподложка исправлены; дублирующий legend снят, пустота передfooter уплотнена.
Остаточная высота относительно минимальногоreference≈49px объясняется настоящим
rare«Точныйподбор»disclosure44px, не legacyвоздухом. Показанную структуру принимаем
с необходимым расширением сохранённых фильтров; это не PASS всехкомбинаций данных.
Исторические замечания выше сохранены, но этими новыми кадрами закрыты.

## A29 measured data screen — первая независимая сверка

Просмотрены `tmp_files/cloud-saves-020/chromium-data-{device-390,device-844,cloud-844}.png`
с reference-data390/844. Selected data1 каркас tabs→summary→sync/notes→maintenance
quietrows соответствует. Раскрытое maintenance/exports в снимке — реальное
состояние обхода, не доказательство defaultopen. Cloud844 прокручен, поэтому
отсутствие tabs сверху этого кадра не считается потерей вкладок.

Реальная summary показывает measured3категории/legend; её высота больше fake
reference, но это функционально обоснованная информация. Отступы/rowиерархия не
возвращают старый dashboard. Открытые конкретные отличия переданы ведущему:
- tabs и summary почти соприкасаются (0–2px), reference имеет12px semanticgap;
- autosavecloud остаётся nativewhitebox вместо принятого compactpill;
- plural«1 сохранений» требует корректной формы;
- внутри раскрытого экспорта две icon-only file/cloud кнопки мало объясняют touch
  действие: экспорт следует подписать/сделать quietrow, cloud увести в per-save
  context или ясно подписать. Это локальный semanticdebt, не новый дизайнвариант.

Scoped review не доказывает quota-accuracy/liveprovider/importconflicts/physical
storage и не заменяет выбранные A29 behavioraltests, которые выполняет ведущий.

## A29 final selected-state review

Просмотрены свежие Chromium device-default390, WebKit cloud-default390 и expanded
Chromium device390 после четырёх исправлений. Gap tabs/summary12px появился;
cloud auto-save использует общий compact ui-switch; «1 сохранение» корректно;
экспорт — целиком подписанная строка с действием Сохранитьвфайл, лишнего cloudicon
нет. Показанные default/expanded состояния принимаются по композиции data1.
Maintenance по умолчанию закрыт, открытый экспорт — отдельное состояние walkthrough.
Оставшихся структурных блокеров в этих трёх состояниях не обнаружено.
Ведущий отдельно сообщает wholecloudcase обоимиengine/lateUsageBack/newData/
receivekeepssource; визуальная сверка не заявляет проверку liveprovider/quotaaccuracy.

## A30 первая строгая сверка и оставшиеся задачи

Просмотрены packs-021 Chromium installed390, WebKit installed844/availableerror390
и Chromium importpreview390 с referencepacks. Согласованный перенос15реальныхигр:
quiet CheckUpdates выше списка; compactmetadata version/size/status; updateaction
лишь при pending; secondaryoperations под context; глобальное Дополнительно.
Постоянная Deleteизодноигровогоdemo обоснованно заменена context по указанию владельца.

Остатки переданы UI/ведущему:
1. Doublewrapper outeroutline+innerfilledheader+отдельная44px «Действиясигрой»
   расходует≈134px наигру. Рекомендован один details: summary=art/name/meta/chevron,
   внутри quietactions. Убирается служебная постоянно пустая строка, функции остаются.
2. Availableerror повторяет одну ошибку до и после Retry; достаточно одного inline
   сообщения с одним Retry, без конкурирующих текстов.
3. **Importpreview blocker:** на actualPNG видны старые установленные игры и pinned
   Отмена/Установить, но нет названия импортируемого файла. В source previewMarkup
   вставляется перед всемсписком, а open/restoreView сохраняет нижнийscroll после
   нажатия ИмпортвДополнительно. Наличие previewвDOM не закрывает проблему. Нужен
   отдельный childpreview либо focus/scrolltarget при входе и восстановление исходного
   списка на Cancel. До этой проверки импорт visualaccepted не считается.

## A30 final independent selected-state review

Просмотрены заменённые final PNG: installed390/844, importpreview390,
available-ready390 и available-error390. Single details summary=art/name/meta/
chevron убрал doublewrapper/лишнююпостоянную44pxrow; карточка≈88px. Импорт
показывает название Счётчик/версию0.1.0/автора/trust до pinnedInstall; прежний
hiddenpreview blocker закрыт в этом реальном кадре, UI добавил viewport/cancelscroll
assert. В Available одно error+Retry; positive validbundlecard имеет понятный Install.

Эти выбранные состояния принимаются по композиции A30 с согласованной адаптацией
на15реальныхигр и quietsecondaryoperations. Это не PASS livecatalog/всехошибок/
физическогоiPhone; functionaltests описаны UI в PACKS-IMPLEMENTATION.md.

## A10 first independent review

Просмотрены actualChromiumjoin guest390/preview390/preview844 из
`playroom/dist/test-results/room-entry-captures/` рядом с reference-join.
Fullscreen код/ссылка→Найти→preview→явный Join соответствуют selected join0.
Guestauth requirement — реальное состояние, не ошибка отсутствия fakeprototypeguest.
Preview844 ниже fold допускает собственныйbody-scroll; скрин не доказывает потерюJoin.

**Незакрытый визуальный P0:** «Войти или создать аккаунт»/«Рядом» отрисованы как
браузерные grayrectbuttons/defaultborder, не approved quietrows; chevron не
выравнен как часть строки. Это не смена палитры: rowstyle/semanticlayout отсутствуют.
Передано ведущему до принятия A10. Остальной input/card/frame корректен в просмотре,
но наличие Find/Join не закрывает эти стандартные браузерные рамки.

## A10 final row fix и A20 independent selected-state review

A10 fresh Chromium guest390/preview390/preview844 пересмотрены. Nativegrayboxes
заменены общими quietrows с выровненнымchevron; прежний P0 закрыт. Код/ссылка→Find→
preview→explicitJoin и guestauthcue соответствуют selectedjoin0. Shownscopeпринимаем,
не заявляя nativeinternet/WebKitroomflow по одним Chromeкадрам. Остаточныйminor:
Find/Join сохраняют более объёмный старыйshadow относительно новых flatcontrols;
если уплотнять, только общим actionstyle, не локальным offset.

A20 просмотрены шесть новых selectedframes из twelve delivered:
application-group-create390WebKit/create844Chromium, info390Chromium/info844WebKit,
invite390Chromium/invite844WebKit. Create — полноценный singleformname+selection+
submit, как groupsvariant1; optional search/count/permissioncue относятся к реальным
спискам. Info больше не имеет огромного filledmemberbox/iconfooter: quietmemberrows,
self«Вы», sharedhistorypill, подписанные invite/leave. Invite указывает конкретную
группу, число выбора и ожидание подтверждения. Эти композиционные scopeпринимаются.

Необязательная оптимизация передана автору A20: searchпоказывается даже при1–2
доступных людях, прибавляя≈70px и сдвигая CTAнижеfold844. Можно условно показывать
его при длинномсписке или активномquery. Это не новый вариант и не blocker singleform;
реальный поиск/права/состояние сохраняются. Общий headergap не компенсировать локально.
Ведущий/автор отдельно подтверждают Chromium1/1 иWebKit1/1 behavioralcase.

### Текущие границы строгой приёмки (заменяет историческую стартовую матрицу)

**Принимается только описанный selected-state scope:** A02 filters/catalogdensity;
A04 empty/tools; A08 editorframe на3играх; A09 inviteframes; A10 Chromejoinframes;
A16 singleplayerwin; A19 freshDMunderlay; A20 create/info/invite; A26 profileguest/
signed; A27 categories; A28 realtheme/skingallery; A29 measureddevice/clouddefault/
expandedexport; A30 installed/available/error/importpreview. Это не полное закрытие
функциональной матрицы или всех ролей/ошибок этих ID.

**Нужны отдельные свежие структурные пары/состояния:** A03 modeselection, A04filled
sessioncards (emptyfix не переписывал sharedcard), A06 permittedparticipantactions,
A07 bot/slotpanels, A11 connectionfinal, A12nearbywizard, A13access/close, A14other
packlayouts, A15gamemenu, A17transfer, A18socialtoolbars/grouping, A21/22chats/keyboards,
A23anchoredreaction/reply, A24invitationstates, A25authmodes, A31rulesreading,
A32notificationtypes, A33updateflow, A34motiongesturestates, A35statecoverage и
A36finalconfirmheader. Существующие behavioralPASS по ним не выдаются за просмотр
актуальной композиции. Общий36screenvisualPASS по-прежнему не выставлен.

## A11 final independent presentation review

Прочитан CONNECTION-IMPLEMENTATION.md. Независимо просмотрены семь actual кадров
из `connection-021` рядом с reference-connection390/844:

- checking390 Chromium и844 WebKit;
- error390 WebKit и844 Chromium;
- paused390 WebKit;
- success390 Chromium и844 WebKit.

Композиция selected connection0 сохранена: fullscreen header, один основной stage,
конкретный наблюдаемый статус, meter, дополнительные методы в закрытых details,
закреплённый footer. Редкие подробности не возвращены постоянным длинным списком.
Пауза и ошибка не обещают продолжающуюся проверку: meter убран, Retry/Cancel
подписаны и читаемы. Success показывает галочку и фактически supplied TURN/TLS.
В ожидании нет числового fakepercentage; indeterminate band не объявляется
завершённой долей. Статичный вид при reduced motion допустим.

В error844 детали ниже fold принадлежат scroll body, footer остаётся видимым.
Focus ring раскрытых details — реальное keyboard состояние проверки, не дефект
темы. В показанных семи состояниях структурных блокеров/нечитаемых значений не
обнаружено. Этот presentation scope принимается.

Это не проверка реального ICE/STUN/TURN, интернет-реле или физических iPhone/Pixel.
CONNECTION-IMPLEMENTATION описывает три выбранных функциональных запуска с
контролируемыми transport/credentials портами; эти результаты не расширяем по
содержимому красивого success кадра. Не все варианты методов/ошибок визуально
просмотрены, общий 36-screen visual PASS по-прежнему отсутствует.

## A04 filled records — независимый review, ещё не полное принятие

Прочитан `fidelity/saved-021-evidence.md`; просмотрены семь final actuals:
host-active390Chromium, client-active844WebKit, cloud-active390WebKit,
actions390Chromium/actions844WebKit, history390WebKit/history844Chromium.
Операции стали понятнее: quiet signed Continue/Join/View/Get вместо множества
primarybuttons; readonly/частичная история не маскируются под livecontinuation.
Роли/комната/участники/ход/дата происходят из настоящих summaries; cloudrecord явно
отделяет получение копии от входа в комнату. Landscapeprimary справа виден у первой
записи выше fixednav. Portrait tray раскрывается сдвигом как ownerPocketCastcomment.

Для строгой сверки дополнительно сняты настоящие filled состояния connectedprototype:
`reference-saved-filled-{active,history}-{390,844}.png`, изменены только demo flow.room/
running/history и selectedtab. Это не перерисованный по памяти макет. Они показывают
compactquietrow≈56px, а не шесть строк старой карточки.

**Открытые выводы переданы ведущему/автору A04:**
1. Portraitactual≈200–220px/record всё ещё существенно плотнее по функциям и выше
   reference. Реальные metadata оправданы, но не обязаны все быть постоянными.
   Предложение для решения ведущего: compact80–110px title+role/status+progress/
   partialwarning, mainaction рядом; participants/exactdate/secondaryroomdetails
   в context. Readonly/partial остаются явными. До решения не объявлять полное A04
   visualacceptance только на основании greenselectedtests.
2. Во всех просмотренных844actual нижний selectedpill оказался под Игры, хотя
   открыт раздел Моипартии; badge оказался между разделами. Portrait корректен.
   Это общий navgeometry blocker, передан ведущему: проверить relative/absolute/
   translate базу нового компонента вне прежнего <=760media, не savedoffset.
3. `actions844` кадр показывает первую collapsedUNO, открытая вторая запись ниже
   fold. Он не доказывает вид раскрытого landscape tray. У автора запрошен один
   targeted кадр с намереннымscroll к раскрытой записи, не новый весь walkthrough.

Автор сообщает Chromium1/1 иWebKit1/1 selected real case, два storagecontexts,
readonly importedUNO/live local сохранены, nativeSupabaseRequests0. Эти полезные
поведенческие результаты не закрывают перечисленные visual/evidence отличия.

## A28 final registry revision — независимая сверка семи состояний

Прочитан APPEARANCE-IMPLEMENTATION.md. Просмотрены Theme390WebKit,
Deck390Chromium/844WebKit, Arts390WebKit/844Chromium и Avatar390Chromium/844WebKit
из `appearance-021`. Галерея сохраняет selected appearance1 каркас fullscreen→
Тема/Колода/Арты→samples→Cancel/Apply. Настоящие immutable Light/Dark, бежевый/чёрный,
реальные канонические скины и selected draft вместо demo-палитр — верно по владельцу.
Deck844 уже прокручен к выбранному образцу; скрытая верхняя форма в этом кадре не
считается обрезанием. Arts показывает честное «только стандартное» для Домино.
Семь кадров не доказывают все families/игры и физическую клавиатуру.

Основная gallery композиция принимается для показанных состояний. Avatar — отдельный
незакрытый responsive gap: фиксированные6колонок растягивают клетки с≈52px вportrait
до≈122px на844, показывают лишь1.6ряда вместо полезного заполнения ширины. Предложен
общий auto-fill с клетками≈52–64px и большим числом колонок вlandscape, сохраняя
44px targets/прежние арты. Передано UI/ведущему; исходники не изменялись критиком.
Также Arts844 empty-explanation нижеfold — небольшая оптимизация вступительных
отступов возможна, но наличие scroll само по себе не ошибка. Документированные
Chrome3/3 иWebKit3/3 registry/lifecycle cases не закрывают размер клеток визуально.

## A04 compact follow-up после решения ведущего

Просмотрены пять обновлённых Chromium actuals: host390,client844,cloud390,history390,
actions844. Mainrow≈84px, на390 помещаются6записей, primary справа. Роли/readonly/
partial остались явными, participants/room/date/version доступны в context. Это
соответствует принятому решению адаптировать truefilledprototype к реальным данным;
прежний densityblocker200–220px закрыт в показанном scope.

В новых844 selectedpill/activebadge находятся у Моихпартий: прежний общий navblocker
закрыт на этих кадрах. Actions844 теперь намеренно показывает именно раскрытую
qa-local запись с тремя доступными действиями выше nav — evidencegap закрыт.
Остаточная не блокирующая подпись: «Сохранение и облако» переносит последнюю букву
слова на другую строку узкогоtray; предложено короткое «Облако/Облачнаякопия».
FinalWebKit этой compact ревизии на момент записи ещё ожидается; прежние highcardWK
кадры не выдаются за визуальную проверку новогоDOM.

## Финальная короткая сверка A04 / Avatar / Navigation

После source freeze просмотрены пять новых WebKit PNG без повторения большого
прогона: application-saved-client-active390, application-saved-actions844,
appearance-021/webkit-avatar390/844 и navigation-021/webkit-navigation-sessions844.

- A04: compact readonly/public/private записи явно показывают режим просмотра и
  неполную историю; live CTA «Продолжить» помещается. Раскрытая qa-local строка
  действительно видна в landscape, три действия доступны выше navigation.
  Короткая подпись «Облако» устранила разрыв слова в tray.
- Avatar: landscape использует ширину для дополнительных колонок, клетки больше
  не раздуваются до122px. На844 видны все четыре компактных ряда, в portrait
  прежняя плотность и понятный выбранный образец сохранены.
- Navigation: выбранная область и бейдж привязаны к Моим партиям в844, а не к Играм
  или промежутку между разделами. Прежний общий visual P0 закрыт.

Перечисленные P0/P1 замечания закрыты в просмотренных состояниях; новых конкретных
блокеров в этих пяти кадрах не обнаружено. Root отдельно сообщает final navigation
12states в обоих движках, A04 по1/1 и caller-responsive по1/1; эти измерения не
выдаются за физический swipe, live cloud или полную приёмку всех36 решений.
Предыдущие высокие карточки/плавающий badge/шесть огромных avatar-колонок являются
историческими этапами и не описывают финальные кадры.

## A31/A33 — финальная независимая presentation-сверка

Прочитан A31-A33-READER-UPDATE.md. Попарно просмотрены brief390Chromium /
brief844WebKit / full390WebKit / full844Chromium и reference-help390/844.
Последнее указание владельца имеет приоритет: краткие правила — один материал,
не исходный demo-wizard. Новые Back/Правила/(?), общие вкладки, безопасный Markdown
и закреплённый вызов полного оглавления соответствуют этой задаче. В прокрученном
full кадре вкладки могут быть выше, но оглавление остаётся доступным. Реальные
длинные игровые тексты не подменены коротким демонстрационным содержимым.
В четырёх выбранных reader-кадрах новых структурных P0/P1 не обнаружено.

Update: просмотрены available390/844, preparing844, unknown390, measured390,
paused844, ready390/844 из reader-update-audit с reference-update. Сохранён
отдельный экран: сводка релиза/Что нового → текущий статус и progress → одно
актуальное основное действие. Неизвестный объём не получает процент, измеренный
объём показывает реальные значения state, пауза — Продолжить загрузку, ready —
Установить и перезапустить. Метка ошибки/красная полоса и подпись передают смысл
вместе; не требуется угадывать цвет. Selected presentation scope принимается.

В 844 preparing/ready верх карточки частично прокручен для видимости CTA; это
состояние scroll-body, не доказанное обрезание содержимого. В available844 вся
карточка видна. На этих восьми кадрах новых структурных P0/P1 не обнаружено.

Текст «Понятные экраны и удобный чат» на screenshot — явная fixture-запись в
pack-update-notice-browser, а не подтверждение production release metadata.
Проверен source: UpdateDialog берёт строку из выбранных release changes динамически,
не из hardcoded demo. Presenter states не доказывают загрузку; отдельные настоящие
PWA operations Chrome2/2 описаны автором и не выдаются за physical app restart.
Также не заявляются все packs/объёмы правил, все download errors или iOS keyboard.

Открытый вне reader-lease вопрос: дополнительный вход «Как играть» из шапки
редактора правил. Владелец перечислял карточку/лобби/партию; root уведомлён, этот
композиционный выбор не менялся без его решения.

## A25 — явные Auth-режимы, независимая сверка

Прочитан original lab `form(c,0)` из неизменённого источника и реальные account
reports. Просмотрены шесть current кадров: login390Chromium/844WebKit,
signup390WebKit/844Chromium, recover390Chromium/844WebKit из account-021.
Полноэкранная поверхность, три явно подписанных режима, соответствующие поля,
одна primary-submit и тихий гостевой выход соответствуют intended account0.
Connected prototype username-only account был демонстрационной заглушкой; его
нельзя переносить вместо настоящих Auth-полей.

Чтобы избежать ложного сравнения с этой заглушкой, дополнительно сняты
`fidelity/reference-account-form-{login,signup,recover}-{390,844}.png`.
Capture вызывает исходный labContent для account с variant0 и нужным c.state,
обходя только поздний connected demo-body. Это не нарисованный заново макет;
prototype-v1.html на диске не изменялся. Скрипт /tmp/hod-account-form-reference.cjs.

В defaults новых P0 композиции не обнаружено. Ниже fold на844 остаются нижние
поля длинной регистрации, доступные обычной прокруткой. Бounded default scope
принимается, не расширяясь на все inlineerrors/signed management.
Небольшой UX-остаток: signup не объясняет минимальную длину пароля/формат username
до ошибки; original form имел placeholder «Не менее8символов». Передано ведущему
как возможный helper, без нового режима или дополнительных шагов.

Отдельная узкая виртуальная проверка /tmp/hod-auth-keyboard-review.cjs:
headless Chromium viewport390×430, реальная Profile→Auth→Signup форма, без Submit.
Focused password bbox373..420 виден; Tab к настоящему Submit прокручивает его
в292..340, горизонтального overflow/pageerrors нет, nativeSupabaseRequests0.
PNG chromium-account-signup-keyboard-size-390 и keyboard-size-review.json.
Это сжатие viewport, **не** нативная клавиатура iPhone/Android.

Запрошены лишь два дополнительных error-кадра у ведущего: loginerror844 и
signupratelimit390. В source account-message расположен после guestexit; поэтому
default-кадры не доказывают своевременную видимость ошибки после Submit.
Это пока открытый presentation-вопрос, не подтверждённый дефект. Existing target
reports говорят о сохранении ввода/режимов/errors/keyboard и Chrome1/1/WebKit1/1;
эти функциональные результаты не заменяют расположение сообщения в viewport.

### A25: отдельные error-кадры после исправления feedback placement

Просмотрены новые account-login-error844 и account-signup-error390 обоих движков.
Прежнее source-положение feedback после guestexit оказалось настоящим дефектом:
ведущий сначала получил regression FAIL, затем перенёс сообщение внутрь формы
перед Submit. Signup390 теперь показывает подсказки username/password, явную
rate-limit ошибку и primary вместе; Chrome loginerror844 тоже читается с кнопкой.
Эти конкретные исправления подтверждены визуально.

Оставшийся P1 в WebKit loginerror844: сообщение видно, но кнопка Войти почти вся
ниже scroll-body — видна только верхняя зелёная полоса, подписи нет. Прокрутка
nearest только нового сообщения не привела retry CTA. Для foreground нового
feedback нужно видеть сообщение и primary как один контекст, сохраняя owner и
не переводя фокус. Это передано ведущему; полного принятия error→retry по этому
кадру пока нет. Нормальный scroll длинной формы сам по себе не ошибка, но конкретно
здесь действие повторной попытки после запроса осталось нечитабельным.
Источник не менялся критиком; дополнительных драйверов/больших тестов не запускали.

### A25 final feedback+Submit group

Повторно просмотрены обновлённые WebKit login-error844 и signup-error390 после
формирования общей account-feedback-action. Теперь в landscape целиком видны и
сообщение, и Войти; прежняя тонкая зелёная полоска вместо кнопки устранена.
Signup сохраняет ясные ограничения username/password, rate-limit сообщение и
Submit. Этот конкретный P1 закрыт, новых блокеров в двух повторных кадрах нет.
Ведущий сообщает новые bbox-asserts feedback+Submit и Chrome1/1/WebKit1/1, а также
36 geometry состояний общих вкладок; они не выдаются за native OS keyboard.

## A19 friend search — независимый аудит шести состояний

Прочитан FRIEND-SEARCH-IMPLEMENTATION.md. Просмотрены двенадцать актуальных кадров
из friend-search: guest/query/loading/empty/error/relationships в390/844,
движки чередовались. Контекст «Добавить друга», поиск по имени аккаунта и явный
гостевой переход Auth→Search понятны. Loading отличается от пустого результата,
старый no-result не соседствует с новой ошибкой. Четыре фактических отношения
показывают signed Accept/Add и disabled Pending/Alreadyfriend; отдельное identity
действие открывает профиль. Основной fullscreen search и дочерний profile-sheet
согласуются с выбранным A19 и общими поверхностями. В просмотре P0 не обнаружено.

Оставшиеся точечные замечания переданы ведущему без runtime-правок:
- В error state одновременно видны primary «Найти человека» и второе «Повторить
  поиск» с тем же query. По GOAL это лишний дублирующий вход. Предпочтительнее один
  primary, который становится Retry, с feedback рядом, как исправленный A25.
- Между primary и сообщением примерно50px; лишняя вертикальная пустота увеличивает
  путь к Retry в landscape. Не возвращать это локальным браузерным offset.
- «Не удалось выполнить действие (HTTP503)» — общий технический текст; контекстное
  сообщение о поиске было бы яснее, код может оставаться в дополнительных деталях.

Это presentation audit, не повторение ownership/социальных RPC tests. Автор описывает
same-query/held-request/account-switch guards, real UI/Auth/Social adapters и
safe fixture nativeSupabase0; они не означают просмотр всех friend/profile flows.
Новые драйверы или обращения к реальным пользователям в этой сверке не запускались.

## A03/A06/A07 — финальная независимая сверка 19 кадров

Прочитан `fidelity/context-choices-021-evidence.md`; автор подтвердил final freeze
после отдельного responsive исправления gamecard. Просмотрено19 actual кадров,
охватывающих все13 состояний, с чередованием Chromium/WebKit:

- gamecard390/844;
- slot390/844 и slot-closed390;
- bot390/844, bot-readonly390;
- local-human390/844, local-person844;
- spectator-connected390/844, member-host390, table-connected844, self-role390;
- playing-person844, offline-person390/844.

A03 воспроизводит короткую контекстную панель: арт в portrait, тихие режимы с
подписями и иконками, отдельное Как играть. Поздний порядок На устройстве/Онлайн/
Рядом соблюдён. В низком844 декоративный арт убран, все четыре действия видны
на полной ширине без ненужного дополнительного scroll.

A07 открытый/закрытый слот показывает конкретный выбор, а не cycle неизвестного
типа. Локальный человек добавляется одной короткой формой с подписанным Submit.
У бота три ясные сложности, редкие имя/аватар/поведение под Advanced, отдельные
Save/Remove. Readonly бот показывает причину и не предлагает недоступное сохранение.
Это соответствует выбранному «Свободный слот → выбор» и позднему упрощению.

A06 identity компактна, self/host/игрок/зритель/Стол/связь различимы из фактического
состояния. Роль Стол и зритель не запрещают добровольный Transfer. Offline-transfer
disabled с объяснением, временный бот отдельным подписанным действием. Невозможная
передача локальному человеку объяснена. Действия тихие, опасное исключение выделено
красной подписью, не рядом конкурирующих icon-only кнопок. При отсутствии mapping
account-userId Nearby не выдумывает личный чат.

В spectator/playing/offline844 панель действительно844px/x0; три computedJSON
согласуются с новыми изображениями. Исторический560 на актуальном проходе не
воспроизведён; не приписываем его SDK или несуществовавшему widthpatch.

Новых структурных P0/P1 в этих19 кадрах не обнаружено; описанный selected-state
presentation scope принимается. Это не просмотр всех52 PNG, всех32-player/ready/
recovery combinations, не повтор полного host-transfer протокола и не physical
keyboard/gestures. Автор отдельно документирует Chrome1/1/WebKit1/1 actual RTC
case, metadata stability и миграцию выбранных прежних bot cases; красивыми кадрами
эти границы не расширяются. Source критиком не изменялся.


## A17 / A15 / A21 и A19 Retry — независимый selected-state review

Просмотрены актуальные Chromium390/WebKit844 consent из host-offer-021,
launcher/menu/chat/settings-child из ui-platform-audit в обеих ориентациях.
Сверка с reference-transfer, reference-gamemenu и reference-chat учитывает поздние
решения владельца о добровольном host offer, edge launcher и расширяемом чате.
Source критиком не изменялся; настоящие RTC/ownership проверки авторов не
подменяются этим presentation review.

**A17:** показанная consent-панель у нижнего края, fullwidth в844, header/Close,
короткий текст и Decline/Accept читаются; исходный room chat виден под scrim.
Нового geometry P0/P1 в двух кадрах нет. Passive banner не переснимался критиком
в этом проходе: из этих кадров нельзя отдельно принять его поведение. P2 clarity:
в отличие от reference вопрос не называет предложившего; playing source говорит
«полное состояние партии» вместо понятного эффекта управления комнатой и
сохранения роли/продолжения игры. Реальные sender metadata предпочтительнее
технического текста, но это не блокер геометрии просмотренных lobby consent.

**A15 и launcher A21:** меню снизу portrait / справа landscape, тихие подписанные
строки и отделённый Stop, общий контекст Settings-child выглядят согласованно.
Launcher68×44/44×64, flat outer edge, icon+small arrow и отсутствие подписи Чат
соответствуют позднему решению. Зелёная focus ring в WebKit допустима. На shown
settings-child844 Reset находится ниже fold; это нормальный scroll длинной формы,
а не тот прежний A25 defect, где после запроса скрывалась retry-кнопка.

**A21 полностью не принят:** новый drawer по-прежнему содержит старый большой
скруглённый green history container; в reference-chat оформлены сообщения, история
лежит прямо на фоне панели. Header повторяет game art/name/room и history icon
вместо краткого контекстного «Чат комнаты». Отсутствие командных tabs для обычного
Домино корректно. Reaction glyph выглядит около8px и несопоставим с send icon;
нужен штатный читаемый reaction icon с прежними реальными быстрыми реакциями.
В свежих chat кадрах orange линия идёт по верхнему/левому краю content: происхождение
уточняется у UI, до подтверждения это не приписывается production palette.
Эти остаточные structural/visual различия переданы ведущему; их нельзя закрыть
functional PASS общего registry или сохранением draft.

**A19 Retry:** просмотрены свежие error390Chromium/error844WebKit. Предыдущее
дублирование Retry исправлено: один primary «Повторить поиск», contextual feedback
внутри формы без HTTP-кода. Прежние три замечания к error-state закрыты в данных
кадрах; новых P0/P1 не обнаружено. Native keyboard и физические жесты этот
presentation review не проверял.


## A13 room name — независимый финальный name-only review

Прочитан room-name-021-evidence.md. Просмотрены fresh invalid390Chromium,
pending844WebKit, error390WebKit/error844Chromium и saved390WebKit, сопоставлены
с reference-roomsettings390. Поле → inline validation/pending/error → подписанные
Сохранить/Отмена читаются вместе, обе кнопки видны в низком844. Поле занимает
полную ширину, оставшийся selected text очевиден; saved кадр показывает уже
сохранённое имя в поле и underlying lobby heading. В этом name-only presentation
scope новых P0/P1 нет; он принимается.

Это не общая fidelity-приёмка A13: дополнительные свободные места и entrances
Rules/Game делают реальный контекст существенно длиннее прототипа и находились
вне name lease. Остаточное замечание вне name scope: «Закрыть комнату» выглядит
обычной зелёной строкой/door icon, хотя reference и общий язык выделяют destructive
action красным. Передано ведущему отдельно. Ошибка «Пробная ошибка сохранения»
является текстом fixture, не приписывается production copy. Документированные
Chrome1/1+WebKit1/1, Unified5/5 и late owner/actor guards принадлежат авторским
functional checks; физическая клавиатура и все сетевые режимы этим просмотром
не проверялись. Runtime критиком не изменялся.


## A21 structural replacement — повторная независимая приёмка

После отдельного game drawer builder просмотрены шесть fresh состояний:
ui-platform-audit/chromium-chat-390.png, webkit-chat-844.png,
webkit-team-chat-390.png, chromium-team-chat-844.png,
chromium-chat-error.png и webkit-chat-retried.png. Сопоставление с выбранным
reference-chat390/844 сохраняет поздние owner overrides composer/launcher.

Прежние structural замечания закрыты: header теперь «Чат комнаты» и Close справа,
game/room/avatar/refresh не дублируются; история лежит прямо на drawer background,
оформляются отдельные сообщения. В Домино нет выдуманного team channel, в настоящем
Ludo показаны Общий/Команда и blue-team сообщение. Caption/time/reaction pill
различимы. Большая зелёная рамка вокруг всей истории устранена.

Capsule composer закреплён снизу, transparent reaction и green Send имеют44px
области, читаемый общий20px reaction SVG. Многострочный draft не вытесняет кнопки.
При ошибке видны contextual «Нет связи с хостом…» и тихое Повторить рядом с задачей;
после retry сообщение исчезает, текст в поле сохраняется. Частично обрезанная
верхняя/нижняя bubble в scroll history является реальным положением прокрутки,
не скрытым footer или ошибочным центрированием.

Orange линия оказалась настоящим global focus-visible, а не тестовой разметкой.
Она заменена зелёным --ui-focus вокруг resizepill; keyboard indicator сохранён.
Исчезла ненужная inherited margin-bottom20px шапки. В показанных шести кадрах
новых P0/P1 нет, bounded A21 presentation scope принимается. Это не приёмка всех
DM/group interoperability состояний, физических keyboard/swipe либо всей36.
Авторские 15states/RTC paging85records/reply/reaction и anchor0 описывают отдельное
functional evidence; критик их не подменяет просмотром. Runtime source не менялся.


## A18 final Community — независимые пять состояний

После final freeze code_critic просмотрены community-owner/chats-390-chromium,
friends-844-webkit, guest-390-webkit, empty-390-webkit и error-844-chromium PNG,
сопоставлены с reference-social844. Старый icon-only Add/Edit/Refresh toolbar
устранён; поиск → реальные карточки имеет примерно12px, а после списка находится
одна подписанная Create/Add задача. Notifications и редкое управление списком
выглядят спокойными вторичными входами, не конкурирующим рядом крупных кнопок.
Guest имеет понятный login/signup, empty отличается от failed refresh; contextual
error и Retry расположены вместе, сохранённый список ниже не выдаётся за новый.
В низком844 первая запись помещается так же, как в reference; не требуется
искусственно показать весь список без прокрутки.

Новых P0/P1 в этих пяти selected states не обнаружено, этот presentation scope
принимается. Автор сообщил финальные Chromium5/5+WebKit5/5 owner cases,
intercepted26/native0/errors[]; они не заменяют визуальный просмотр остальных
состояний или неоконченную DM/group interoperability. Runtime критик не менял.
