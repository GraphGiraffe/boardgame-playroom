# Звуки, обучение и продолжение партий — 4 ноября2026

Проверенная временная [PWA](https://seth.tail6aebd4.ts.net/) обновлена (также порт8443 и [standalone](https://seth.tail6aebd4.ts.net/hod-021.html)). App0.21.0-preview.1 / collection0.8.9-preview.3,15игр; installed2fee8a неизменён. Standalone SHA256 `488e6f3eb0c0697f31f3aeab850fbf96a6cdf3d751e5ef93806d59c105436a6d`, cache `1a3d814a35a0b095`. PWA227файлов,6 120 573байта. Stable/Pages/R2, новые SQL, реальные сообщения/Push и объявления не выполнялись.

## Исправления

1. Позднее presentationReady подтверждение на закрытом public client port сначала синхронизировало UNO reaction windows, а затем возвращало CLOSED. После dispose это восстанавливало уже удалённый fallback timer. Guard перенесён перед синхронизацией. Публичный порт теперь возвращает CLOSED без таймеров и поздней мутации оставленной Session. Это подтверждённый lifecycle-дефект, но причина прежнего физического зависания не установлена.
2. Общий переключатель называется «Подсказки во всех играх», локальный — «Подсказки в этой игре». При общем выключении виден короткий текст, что локальный выбор сохраняется; сам локальный переключатель доступен. Пояснение обновляется по существующему game-options событию после записи настроек, переживает Back/reopen и сброс; при общем включении скрывается. Длинная подпись переносится. Введение обучения называет точный путь Меню партии → Настройки → Поведение. Прогресс/идентификаторы целей и логика обучения не менялись.
3. История ходов находится среди основных действий после паузы, перед правилами/настройками и остановкой партии; используется существующее разрешённое действие, без дублирования. В обычном landscape она видна выше прокрутки. Это улучшение обнаружимости, не человеческая usability-приёмка.

Runtime changes: app/app.js (одна подпись), app/game-menu.js, app/tutorial-settings.js, core/authority.js и производный core/messages.js. В canonical ui-app.json изменены2строки и добавлена1; сообщения сгенерированы штатным generate_messages, без prepare-dev. Игровые паки/installed и исходный service worker неизменны.

## Фактическое покрытие

| Область | Результат |
|---|---|
| Native UI audio | Расширенный existing first-native-touch case Chrome1/1 +WebKit1/1. Сохранены первая committed Yatzy cue после одного trusted touch, локальный Klondike start, mute/UI toggle/dedup и update-ready listener. Добавлены9проверок/engine через реальный ChatNotifications.poll с локальными входами service/account/store: DM, повторDM, активное/истёкшее приглашение, реакция, группа, приглашение группы, friend-request/accepted.15ожидаемых native oscillator starts; повтор и истечение0; AudioContext running, banner mounted, errors/native provider requests0 |
| UNO disposed timer | Старая версия: после позднего ACK pending1 вместо0. Новый код:4/4выбранных presentation unit cases PASS, включая publicport/cleanup/clock advance и неизменённую оставленную Session |
| Ludo continuation | Existing case Chrome1/1+WK1/1: бот идёт под Settings; явная pause держит revision; home→appearance→Back→та же партия; добавлено настоящее human roll3→4, следующий бот доводит до7/turn0, без остаточного modal/inert/busy |
| UNO continuation | Existing case Chrome1/1+WK1/1: bot2 обвиняет bot1 и продолжает при открытых Settings без обязательного ответа человека; native human draw3→4/pass5→bot6/turn0; прежний эпизод штрафуется ровно один раз, без stranded UI |
| Обучения |4existing cases×2engine PASS: OldMaid2/2; Mage8/13; Battleship10/11; GoFish2/2; UNOdeclare1/9. Настоящие ввод/команды, без force-complete; UNO declaration segment — projected legal fixture +trusted pointer/domain/token, persistence — реальный reopen/start того же viewer. Это не полный матч/все цели UNO |
| UX source |12состояний/engine, реальные globaloff/on, localconfigure, Back/reopen/reset, menu History до stop. Initial stale-note RED сохранён; ранний document-change/microtask подход заменён существующим post-write game-options событием |
| Exact HTML |12состояний Chrome+12WK, normal motion, errors/native/drift0. Начальный root harness выбирал также inert visual exit после быстрого Back/reopen: strict duplicate selector. Исправлены только test selectors на activeRoot, без .first()/отключения анимаций; повтор прошёл. Runtime не менялся |
| Масштаб |Ещё12состояний того же exactHTML в настоящем Chrome defaultFontSize32: rootfont32 подтверждён, ряд подписи/кнопок не пересекается и не выходит за границы. Root просмотрел обычный390, landscape844 menu и native-font32 PNG. Это не физический Android font scaling |
| Build/public |exit0,8SHA/3ZIP CRC,230runtime+2canonical locale+5изменённых existing tests совпали с sourceZIP; unchanged installed2fee/sourceworker/4Klondike source. Funnel443/8443+/hod,4public exact-byte checks; live Chrome activated worker с точнымcache/buildIdentity,15игр,protocol1/errors0 |

Свидетельства: `tmp_files/ux-021/functional-1104/{native-audio,bot-lifecycle,tutorials,design-ux,artifact-final,artifact-font32,live-pwa,final-manifest.json,public-check.json}`. Владение общими файлами и source windows согласованы; source holds между batch/copy правками, остальные специалисты давали независимую design/UX/code оценку.

## Границы доказательств

Native audio проверен на9ad runtime до этой небольшой правки. Audio/notification компоненты побайтно прежние; appdiff — одна учебная подпись, authority live-port path сохранён (изменён только CLOSED/disposed путь), локали —3учебных текста. Scoped reuse зафиксирован в native-audio/final-runtime-reuse.json, это не повтор всего audio case на488. Chrome trace metadata field добавлено после его execution без изменения поведения; обе executed-source snapshots сохранены. WK пишет фактический browserType/version; Chrome запускался с explicit engine и unset WebKit shim.

OldMaid/Mage и Battleship Chrome прошли до text-only copy; остальные выбранные Chrome и всеWK после copy freeze. Последующая правка note listener не меняет guide semantics, проверена отдельным UI case. Исходные stale test routes/settings/startup RED сохранены. UNO persistence усилен actual app reopen; native declaration раньше уже проходила, старый RED был после reload до startup/owner readiness. Product guide bug не выявлен. Все tutorial goals не закрыты: Mage ещё ultimate/edit/base/loot-player/loot-card; Battleship fire; UNO8остальных; остальные игры требуют своих сквозных проходов.

Не проверены физическая слышимость/громкость/silent/background, реальные входящие provider messages/invitations и OS Push, все звуки/анимации/DnD/обучения/исходы15игр, реальные сети/TURN, AT и самостоятельная usability. Универсальных menu/navigation/click звуков нет; имеются семантические cues. Native oscillator scheduling и running context не означают, что человек услышал телефон.

В этой итерации нет нового FPS/CPU/INP профиля. Последняя контролируемая пара94→9ad100,5→99,7мс не доказывала заметного ускорения; задержка около100мс остаётся открытой. Монолитная recipe/markup при реальных изменениях тоже не устранена. Следующий SDK спланирован отдельно и не закрывает эти текущие пункты автоматически. Полный GOAL0.21 остаётся active/work.
