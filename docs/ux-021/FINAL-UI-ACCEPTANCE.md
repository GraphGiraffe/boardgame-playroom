# Финальная UI-приёмка 0.21 — рабочий журнал

02.11.2026. **Не завершена.** После уточнения владельца прежние признаки визуальной
приёмки отозваны. Runtime должен повторять выбранную композицию prototype-v1;
прошедшие поведенческие сценарии не подтверждают visual fidelity. Структурная
переработка продолжается, поэтому результаты ниже имеют точный ограниченный scope.

## Независимый проход до structural rewrite

`/tmp/hod-final-ui-guest.cjs`, Chromium, настоящий локальный source fixture/SW,
reducedMotion=reduce, persona guest.20 checkpoints PASS, pageerror=[], document
horizontal overflow=false. Артефакты `tmp_files/ux-021/final-ui-chromium/report.json`
и PNG01–20. Порядок отличается от UX-прохода: редактирование профиля → уменьшенный
viewport390×430 (модель клавиатуры) → landscape844×390 с сохранением ввода → save →
settings → gallery/components → dark/light → cloud/deviceguest → packs → каталог
360×800/list/3/2 → gamecard/online/auth gate без создания room → account430×932 →
empty History → guest Social → краткие/полные правила/TOC → landscape.

Сырая первая попытка остановилась на неверном CSS-селекторе числового значения
`[data-catalog-mode=3]`; селектор исправлен с кавычками, последующий полный проход
прошёл. Это ошибка инструмента проверки, не продуктовый дефект.

Уменьшение viewport не является физической iOS/Android клавиатурой и не подтверждает
native visualViewport/safe-area behavior. Этот проход не заявляет проверку всех36тем.

## Текущая структурная сверка лобби

Утверждённый reference: `tmp_files/ux-021/fidelity/reference-lobby-{390,844}.png`
(нормализованный capture дизайнера). Runtime:
`fidelity/application-lobby-{390,844}.png`, сценарий `/tmp/hod-room-fidelity-runtime.cjs`.
Новая реализация `room-v021` / `lobby-021.css` использует новый markup вместо старых
lobby seat/grid/toolbars. Runtime smoke:0 mode radios,0 permanent type buttons,
3 однообразные participant rows, footer вviewport, no horizontal overflow. Чтение
правил и целая строка свободного места → explicit choice panel проходят.

Свободные места представлены одной видимой компактной строкой «Добавить участника»
с реальным количеством; она открывает выбор для конкретного места. Остальные
свободные/закрытые места доступны в контекстной панели. Прежний disclosure удалён.
Это согласованное дополнение для фактических данных, не возврат к сетке слотов.
Mode/code/host/reason и avatar/art могут отличаться данными от reference.
FakeOS/statusbar не переносится. Итоговую визуальную сверку ведёт дизайнер.

## Актуальный двухклиентский RTC-проход

`/tmp/hod-final-ui-rtc.cjs` запущен после security freeze кодера. Chromium,
два настоящих локальных RTCPeerConnection через ручной SDP-процесс, без Supabase
сигнализации. Девять checkpoint PASS, `errors: []` в
`tmp_files/ux-021/final-ui-rtc/report.json`:

1. Вход вторым клиентом в зрители.
2. A08 editor → reader → Back → Apply доставляет endMode второму peer;
   тот же roomid и RTC channel сохранены.
3. Передача хоста зрителю в лобби: пассивный верхний banner → явная панель.
4. Stop доступен текущему владельцу, включая владельца-зрителя; у прежнего
   владельца без текущих прав этого пункта нет.
5. Настройки → сброс → подтверждение → Back сохраняют точный scene node,
   roomid и тот же RTC channel; далее реальные сообщения/handoff/Stop работают.
6. Черновик чата сохранён после поворота390×844→844×390, уменьшения viewport
   до390×430, закрытия и повторного открытия.
7. Реальные сообщение, ответ и прикреплённая реакция дошли по RTC.
8. Хост передан обратно игроку во время партии. Закрытие панели не отклоняет
   предложение; `focusIncoming(id)` (entry point нажатия Push) открывает её повторно.
9. Настоящее действие владельца Stop вернуло обоих клиентов в лобби.

Свежий `/tmp/hod-final-ui-consent.cjs`: три checkpoint PASS, `errors: []`,
`tmp_files/ux-021/final-ui-rtc-consent/report.json`. Проверены пассивное получение
без захвата фокуса, Escape с сохранением предложения, повторное открытие,
явный отказ с возвратом фокуса и отмена через существующий RTC-протокол, очищающая
banner/promise. Отмена вызвана протокольным entry point сценария, не заявляет
проверку видимой кнопки отмены. Native Push и физическая клавиатура не проверялись.

## Индикаторы и обновление

Общий StatusMeter: неизвестный объём без выдуманного процента/aria-valuenow,
известный — реальные value/total, высота6px, reduced-motion без анимации.
`/tmp/hod-status-meter-review.cjs` проверил6 состояний available/preparing/unknown/
partial/paused/ready в Chromium и WebKit: без горизонтального переполнения;
реальные48.828125% для500КБ/1МБ и100% при готовности. PNG
`fidelity/application-update-{state}-{chromium,webkit}-390.png`. Это заданные
сценарием метаданные, не настоящая загрузка/облачная квота.

Настоящий выбранный PWA-сценарий
`node scripts/codex/test.cjs case/pwa --name 'PWA update isolates a waiting build, drops old caches and starts offline with saved data'`
прошёл2/2: waiting build, pause/resume, проверенные файлы, применение, очистка старого
кэша и offline startup с сохранёнными данными. Подписанное inline-действие прокручивается
в область просмотра до проверки. Публикация и рассылка обновления не выполнялись.

## Покрытие A01–A36 на момент журнала

| ID | Свидетельство и результат | Остаток |
|---|---|---|
| A01 |20checkpoint guest sequence, подписанные roots/no inert | Новые structural roots и signed account review |
| A02 |360px list/3/2, старый12viewports Chromium/WebKit | Финальная новаякомпозиция, longfav/hidden/reload |
| A03 |Actual gamecard/onlinegate, room null до auth | Auth continuation/failedlogin/differentmode |
| A04 |Guest emptyHistory + ранее saved⋯ implementation | Filled manyrecords/swipe/storageoperations |
| A05 |Cleanlobby390/844 smoke+pairedreference; current two-client RTC | Итоговый designer review, Table/8людей |
| A06 |Friendprofile CSS overlap исправлен, UXrerun | Все roles/newpanel composition/asyncstability |
| A07 |Wholeemptyrow opens explicitchoice, no typebuttons | Close/cancel/botdifficulty/currentrole variants |
| A08 |New preset+details;3packs×2orientations9eachengine; apply/readBack/reset/teams, actualRTC | Physicaldevices/allteamlayouts; details RULES-IMPLEMENTATION.md |
| A09 |Invite row существующийhandler; real UIвиден | Friend/group/send/error/return/duplicate tap |
| A10 |Кнопкаcatalog return implementation ранее | Closed/notfound/codepreview/active matching route |
| A11 |Существующие runtime method indicators | Direct/STUN/TURN/cancel/reconnect и physicaldevices |
| A12 |Существующие QR/audio/manual UI | Newwizard composition, permissions, physicalmedia |
| A13 |Свежий authoritative context встроен, actual context smoke | Полная цепь Back из дочерних editors/close cleanup |
| A14 |Unified frame final3games×4viewports eachengine; field364/404, metadata nooverlap | Lead allpacks/animations и finalgamefidelity |
| A15 |Новый4task menu+Дополнительно; actualclick/no-remount | Итоговая парная сверка после общей геометрии |
| A16 |Влобби label/rematch-startoptional; lobbyrestorecasePASS | Natural result новыеcomposition/roles/team/draw |
| A17 |Current realRTC lobby/play spectator↔player; banner/sheet; decline/cancel | Physicalbackground/expiry/actualPush и прочие роли |
| A18 |Communityactions case1/1,white-strips fixed | Structural roots/social новыйreview, signed states |
| A19 |Friendprofile overlapblocking фиксCSS | Signedsearch/request/approve/remove/error |
| A20 |Существующие group protocols | Create/groupinfo/actions/history/leave roles |
| A21 |Current realRTC draft rotate/shrink/reopen | Physicalkeyboard/safeareas, finalchatfidelity |
| A22 |Live room draft/message/reply и controller API | DMlongincoming/search/unread/cacheerror/keyboard |
| A23 |Кодер team/public; наш current realRTC reply/attachedreaction | Все menus/order/geometry/failedACK |
| A24 |Существующая invitation message model | Two-client roomclose/expiredcounter/read-independent |
| A25 |Guest gate иscreen430; room не создан | Signup/login/recover/rate-error/continuation |
| A26 |Typedraft сохраняется resize+rotate+save | Physicalkeyboard/authedaccount/avatar/deviceerrors |
| A27 |Settingsbehavior открыт; найден legacy2colsP1 | CSSfixed; Root теперьструктурнопереписываетsettings |
| A28 |Components/theme dark/light guestflow | Newstructuraltabs/defaults/skins/samples/persistence |
| A29 |Shared actual/unknown meter; quotaUIfixture | Real cloudquota/transfers/conflict/errors/destructive |
| A30 |Installed/available guest tabs | Install/download/offline/dependencies/errors |
| A31 |Brief/full/TOC430+landscape actualclick | Longscroll sticky/anchor focus/allpacks/accessibility |
| A32 |External pushes не отправлялись | Banner/counter/motion consistency/newindicator components |
| A33 |6status fixtures Chromium/WebKit + selected realPWA2/2 | PhysicalinstalledPWA/finalbuiltcandidate afterallchanges |
| A34 |Guest rotations/reducedmotion; actualmenu previous | Newgestures/multitouch/safeareas/physicalkeyboard |
| A35 |Guestempty/cloudgate/deniedstates partial | Fullloading/stale/error/offline/disabled explanations |
| A36 |A17 accept/decline/Escape/cancel+focus actualRTC | Остальные confirms/errororders/physicalBack |

## Условия завершения

Физические iPhone/Pixel/Samsung, systemBack, nativekeyboard, actualPush и QR/audio
требуют соответствующего отдельного evidence; desktopemulation их не заменяет.
До окончания structural rewrite и нового совместного review нельзя считать этот
документ финальным PASS или утверждать, что всеA01–A36 приняты.

## Единая frame-геометрия после WebKit CSS correction

Удалён старый table-status display:contents; новый status больше не несёт legacy
class, inner heading/title/tools используют game-frame-* вместо старых widths.
В layoutScene сохранён один совместимый status hook. Финальный clean frame
/tmp/hod-frame-details.cjs: Domino/UNO/Tictactoe×4viewports в каждом Chromium/WebKit,
12/12 PASS для каждого (390portrait,844/932landscape,return). При844×390 в обоих
поле x119 y13 364×364, self342×364, opponent100px; при932 поле404×404.
Header64px=tools44+title18+gap2, status top72height28. «Домино» целиком в92px;
длинные строки имеют явный ellipsis, не частично отрезанную строку. Overflow=false.
Парные PNG/JSON tmp_files/ux-021/frame-unified/. Это не allpacks acceptance.

Первый добавленный reset assertion сравнивал transferClient wrappers и упал:
публичный getter каждый раз создаёт новый объект. Исправлена проверка на identity
реального channel; повторный полный8checkpoint RTC pass подтверждает корректность.

### Устранённое наложение scene metadata

Pixel review после bbox PASS выявил, что scene .layout-status > .scene-meta
пересекались с title. Общий landscape grid теперь имеет отдельный пустой host track,
participants, status и auxiliary; поле/рука по-прежнему занимают всю высоту.
Metadata остаются доступны в отдельном column slot под участниками. Их общий
scene-meta container укладывает chips вертикально, не выталкивая текст за левый край.
Chromium/WebKit12/12 каждый подтверждают metadata вне host frame и отсутствие
horizontaloverflow; парные Domino PNG просмотрены после последнего исправления.
Никаких gameId offsets, скрытия статистики и изменения landscapeZones нет.

## A08 — структурный перенос редактора правил

Сводка/preset/reset → details реальных параметров → один fixed Save. Старые
двухколоночные blocks удалены. Chromium/WebKit9checkpoints каждый наKlondike,
Domino,Ludo; readerBack сохраняет draft, apply/reopen/reset и help работают,
Ludo preset teams действительно сохранён. Отдельный editorBack отменяет draft.
Текущий RTC report теперь9checkpoints: A08 readBack/apply сохраняет тот же channel
и roomid, второму peer доставлен реальный endMode. После cosmetics CSS repeat RTC
не выполнялся. Footer ownership fix проверен на rules/updates UI.
Подробные команды, limits и артефакты: RULES-IMPLEMENTATION.md.
