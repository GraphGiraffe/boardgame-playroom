# Семантика общих иконок · ревизия 11 ноября 2026

Рассмотрены actual110glyph из `core/ui.js`, их source consumers и динамические входы, а также9отдельных reaction artworks. **Это visual/semantic review, а не один registry-resolution check.** Для каждой строки ниже лично просмотрены SVG16/24px на light/dark atlas; контекст проверен по app/core/shared и15паковым manifest/view/presentation источникам.105ключей имеют действующий consumer/объявленный renderer port,5резервных явно отмечены. Условная ветка не означает, что каждый её server/state сценарий проигрывался заново.

## Метод и доказательства

- Канонический registry SHA256: `3efcce3c6b0563dbc97aa0071d6a029cea595c88ae970921ae2ce7b48e22bcf6`. Полный static inventory и77кандидатных dynamic call sites: `tmp_files/release-work-audit-1111/icon-audit/inventory.json`. Лексический поиск — только superset кандидатов; `text` как поле сообщения и `app` как DOM-ID НЕ считаются вызовами glyph. Shadowed ReactionView.icon — отдельный renderer.
- Лично просмотрены `atlas-1.png`…`atlas-5.png`:110реальных SVG ×16/24px ×light/dark (440образцов). `paint-metrics.json`: пустых glyph0. getBBox у text-based adjustDie выходит на0.5viewBox-unit за24 (логическая text-cell); видимые ±1 штрихи на atlas целы. Не выдаём bbox текста за оптическое измерение каждого пикселя.
- `reactions.png` и `reactions.json`: все9реальных CSS/WebP artworks48/24px на двух фонах лично просмотрены. Первая inline about:blank попытка не разрешила относительные URL; это исправлено ТОЛЬКО в private atlas встраиванием исходных WebP, не runtime. Пустой atlas не считается evidence.
- Literal calls разрешаются в registry; дополнительно вручную рассмотрены typed maps/metadata, header/action factories, participant/badge/status ports ниже. Source traversal исключает dist/generated manifests, но включает живые generated core/tag-registry и canonically owning pack views/manifests.

Новых подтверждённых glyph/action дефектов не выявлено. Readability atlas не является VoiceOver/TalkBack, physical-phone, минимальным target-size или контрастным аудитом каждого существующего экрана. Контекстные кнопки требуют accessible labels; decorativeSVG остаётся aria-hidden. Точечный actual dark contrast Mage control ранее исправлен и проверен в exactHTML, это отдельная public illustration, не ошибка этих110glyph.

## Полный каталог

`review` = рисунок и смысл в указанном consumer проверены. `reserve` = рисунок просмотрен, действующего icon-consumer в текущем corpus не найдено; это НЕ пользовательская операция и не заявленная проверка несуществующего экрана.

| Glyph | Смысл / операция | Consumer / источник контекста | Ревизия |
|---|---|---|---|
| `link-off` | Нет соединения у участника; состояние, не действие | `core/ui.js participantIcon` | review |
| `bell` | Уведомления и их настройки | `app/push-ui.js; community-ui.js` | review |
| `bell-off` | Уведомления отключены | `app/push-ui.js` | review |
| `cloud` | Облачные данные / отправка ожидается | `app/cloud-saves-ui.js statusIcons` | review |
| `file-export` | Приложение → файл; экспорт сохранения/данных | `app/cloud-saves-ui.js; hub-presenter.js` | review |
| `file-import` | Файл → приложение; импорт сохранения/пака | `app/hub-presenter.js; pack-manager.js` | review |
| `cloud-check` | Облачная копия синхронизирована | `app/cloud-saves-ui.js statusIcons` | review |
| `cloud-upload` | Отправить локальную копию в облако | `app/cloud-saves-ui.js actions` | review |
| `cloud-download` | Получить облачную копию | `app/cloud-saves-ui.js actions` | review |
| `app` | Резервный знак приложения; действующего icon-consumer не найдено | `registry only` | reserve |
| `warning` | Предупреждение/ошибка операции, не подтверждение успеха | `app/game-screen.js surfaceSymbols; UNO notice port` | review |
| `gear` | Корень «Параметры» пользователя | `app/hub-presenter.js pages` | review |
| `sun` | Светлая тема / переключение темы | `app/appearance-ui.js` | review |
| `moon` | Тёмная тема / переключение темы | `app/appearance-ui.js` | review |
| `sync` | Операция загрузки/обновления в процессе или на паузе; подпись уточняет | `app/update-dialog.js; pack-manager.js` | review |
| `host-transfer` | Передача роли ведущего | `app/host-transfer-ui.js` | review |
| `cloud-sync` | Облачная синхронизация или изменённая версия | `app/cloud-saves-ui.js; account-ui.js` | review |
| `cloud-off` | Облако выключено/нет связи; локальные данные доступны | `app/cloud-saves-ui.js; account-ui.js` | review |
| `cloud-alert` | Ошибка/конфликт облачной версии | `app/cloud-saves-ui.js; account-ui.js` | review |
| `cards` | Карты: тип игры, счётчик или карточный параметр | `core/tag-registry.js; core/ui.js indicators; pack preview symbols` | review |
| `board` | Поле/настольная компоновка; тип или публичное поле | `core/tag-registry.js; lobby-view.js` | review |
| `pieces` | Фишки: тип/счётчик физических фигур | `core/tag-registry.js; core/ui.js metrics` | review |
| `solitaire` | Пасьянс: тип каталога | `core/tag-registry.js; Klondike/Spider manifest` | review |
| `words` | Словесная игра: тип каталога, metadata port | `core/tag-registry.js; hub-presenter.js filters` | review |
| `puzzle` | Головоломка: тип каталога, metadata port | `core/tag-registry.js; hub-presenter.js filters` | review |
| `duel` | Ровно два игрока: формат каталога | `app/hub-presenter.js formats` | review |
| `three` | Ровно три игрока: формат каталога | `app/hub-presenter.js formats` | review |
| `teams` | Командный формат / группировка игроков | `app/hub-presenter.js formats; Ludo preview` | review |
| `filter` | Открыть фильтры каталога | `app/hub-presenter.js catalogFilterMarkup` | review |
| `star` | Избранная игра; состояние отмечено aria-pressed | `app/hub-presenter.js; pack-manager.js` | review |
| `shuffle` | Случайный порядок/перемешивание; текст задаёт объект | `app/app.js seatOrder; Durak preview` | review |
| `ship` | Корабль/флот: тип, показатель или элемент | `core/ui.js indicators; shared components` | review |
| `sword` | Атака: тип действия/подсказка | `packs/mage-brawl/view.js; parameter symbols` | review |
| `adjustDie` | Эффект изменения кубика ±1 | `packs/snakes/view.js effectIcons` | review |
| `lessDie` | Эффект уменьшения числа кубиков | `packs/snakes/view.js effectIcons` | review |
| `skipTurn` | Эффект пропуска хода | `packs/snakes/view.js effectIcons` | review |
| `secondDie` | Эффект второго кубика | `packs/snakes/view.js effectIcons` | review |
| `extraTurn` | Эффект дополнительного хода | `packs/snakes/view.js effectIcons` | review |
| `shield` | Защита/щит: игровой эффект или публичный параметр | `packs/snakes/view.js; preview symbol port` | review |
| `takeCards` | Взять карты, не вернуть/удалить их | `packs/durak/view.js action; core/ui.js badge port` | review |
| `grid` | Корень Игры / вернуться в каталог; Стол как роль с подписью | `app/hub-presenter.js; core/ui.js participantGlyph` | review |
| `undo` | Отмена последнего действия / возврат предыдущего значения | `app/appearance-ui.js; pack-manager.js; solitaire actions` | review |
| `refresh` | Проверить/перечитать список, не откатить состояние | `app/community-ui.js; push-ui.js; pack-manager.js` | review |
| `hint` | Игровая подсказка | `Klondike/Spider rule-illustrations; game control` | review |
| `history` | История партии; в параметрах — восстановление стандарта через подтверждение | `app/game-screen.js; app/app.js rules reset` | review |
| `help` | Пояснение к текущему правилу/контролу или обучению | `app/app.js fieldHelp; tutorial-settings.js` | review |
| `full` | Войти/выйти из fullscreen; доступное имя меняется со состоянием | `app/game-screen.js fullscreenAction` | review |
| `copy` | Копировать приглашение/код/ссылку в буфер | `app/lobby-network.js; pairing-presenter.js` | review |
| `palette` | Оформление: тип поверхности/раздела | `app/game-screen.js surfaceSymbols` | review |
| `settings` | Настройки текущей игры/соединения; не профильный корень gear | `app/game-screen.js; pairing-presenter.js` | review |
| `play` | Играть/продолжить/начать воспроизведение; подпись указывает объект | `app/game-screen.js; community-ui.js` | review |
| `send` | Отправить сообщение | `app/chat-components.js` | review |
| `reaction` | Открыть набор реакций; не сама отправленная реакция | `app/chat-components.js` | review |
| `arrow` | Передать/продолжить ход, направление в подсказке; подпись задаёт действие | `app/app.js handoff/footer; first-turn-guide.js` | review |
| `back` | Назад к родительской поверхности | `app/game-screen.js; appearance-ui.js` | review |
| `next` | Следующая запись/шаг/пролистывание | `app/game-screen.js replay; hub-presenter.js` | review |
| `prev` | Предыдущая запись/шаг/пролистывание | `app/game-screen.js replay; core/hand-overflow.js` | review |
| `rules-contents` | Резервный знак оглавления; действующего icon-consumer не найдено | `registry only` | reserve |
| `up` | Поднять элемент в порядке | `app/community-order-ui.js; pack-manager.js` | review |
| `download` | Скачать игру/обновление; направление вниз | `app/pack-manager.js; update-dialog.js` | review |
| `down` | Опустить элемент в порядке | `app/community-order-ui.js; pack-manager.js` | review |
| `close` | Закрыть/отклонить/отменить в текущем контексте | `app/game-screen.js; group/chat invitation controls` | review |
| `trash` | Удалить объект; разрушительная операция требует своей проверки/подтверждения | `app/cloud-saves-ui.js; hub-presenter.js` | review |
| `seatType` | Резервный знак места; действующего icon-consumer не найдено | `registry only` | reserve |
| `replacement` | Замена/передача управления участником; состояние слота | `core/ui.js participantGlyph` | review |
| `player` | Человек/профиль/аккаунт | `app/account-ui.js; core/ui.js; parameter declaration` | review |
| `bot` | Бот: выбор управления или автоматическое объявление | `app/temporary-bot-ui.js; app/app.js declaration` | review |
| `bot-easy` | Бот лёгкой сложности | `core/ui.js participantGlyph dynamic bot difficulty` | review |
| `bot-medium` | Бот средней сложности | `core/ui.js participantGlyph dynamic bot difficulty` | review |
| `bot-hard` | Бот высокой сложности | `core/ui.js participantGlyph dynamic bot difficulty` | review |
| `host` | Корона как ресурс (Mage ultimate), не автоматическое доказательство роли ведущего | `packs/mage-brawl/view.js metric badge` | review |
| `lock` | Доступ ограничен/пароль/параметр задан режимом | `app/account-ui.js; Klondike inactive preview` | review |
| `unlock` | Открыть передачу устройства/продолжить за локального игрока | `app/app.js handoff` | review |
| `groupChat` | Групповой разговор/профиль группы | `app/group-ui.js; community-ui.js` | review |
| `chat` | Чат/разговор, открытие связанной переписки | `app/chat-components.js; game-screen.js` | review |
| `mail` | Резервный конверт; действующего icon-consumer не найдено | `registry only` | reserve |
| `gamepad` | Игра/приглашение поиграть/карточка игры | `app/chat-components.js; game-screen.js` | review |
| `wifi` | Локальное/Рядом соединение в метаданных с подписью | `app/game-screen.js savedModeInfo` | review |
| `globe` | Онлайн-режим в метаданных с подписью | `app/game-screen.js savedModeInfo` | review |
| `search` | Поиск сообщений/объектов | `app/conversation-search-ui.js; game-screen.js` | review |
| `people` | Группа людей/участники/назначение первого игрока | `app/community-ui.js; app/app.js firstPlayerMode` | review |
| `clock` | Ожидание/время/лимит раундов, не числовое значение само по себе | `Ludo/other pack previews; status/header ports` | review |
| `pause` | Пауза/незавершённая сохранённая партия/остановка replay | `app/hub-presenter.js; game-screen.js` | review |
| `check` | Принять/готово/успех; не «Прочитано» по одному виду без state | `app/community-ui.js; pack-manager.js; field submit` | review |
| `hand` | Ручное управление/локальная передача/действие рукой | `core/ui.js participantGlyph; pack previews` | review |
| `layers` | Коллекция/паки, не скрытые пользовательские карты | `app/pack-manager.js; lobby-view.js` | review |
| `sound` | Передать приглашение звуком / раздел звука | `app/nearby-view.js; network-ui.js` | review |
| `reset` | Перезапустить обучение/повторить подготовку текущего сценария | `app/tutorial-settings.js; pairing-presenter.js` | review |
| `save` | Сохранить/раздел сохранений и данных | `app/game-screen.js; pairing-presenter.js` | review |
| `rules` | Правила/чтение справки | `app/lobby-view.js; game-screen.js` | review |
| `edit` | Редактировать профиль/объект/комнату | `app/account-ui.js; lobby-view.js` | review |
| `addPlayer` | Добавить/пригласить участника/друга | `app/community-ui.js; chat-ui.js` | review |
| `stop` | Остановить/завершить текущую партию; опасный контекст подписан | `app/game-menu.js; hub-presenter.js` | review |
| `connect` | Подключение к комнате/устройству | `app/game-screen.js surfaceSymbols` | review |
| `trophy` | Итоги/победа/завершённая партия | `app/game-screen.js; hub-presenter.js` | review |
| `camera` | Считать QR камерой | `app/pairing-presenter.js` | review |
| `image` | Считать QR из изображения | `app/pairing-presenter.js` | review |
| `mic` | Слушать акустическое приглашение/ответ | `app/nearby-view.js; network-ui.js` | review |
| `share` | Передать через системное меню «Поделиться» | `app/hub-action.js; network-ui.js` | review |
| `install` | Установка PWA на устройство; отдельна от загрузки пака | `app/app.js; hub-action.js` | review |
| `qr` | QR-способ приглашения/соединения | `app/nearby-view.js` | review |
| `network` | Соединение/выбор метода/настройки транспорта | `app/pairing-presenter.js; nearby-view.js` | review |
| `text` | Резервный знак текста; mode=text рядом не является вызовом glyph | `registry only` | reserve |
| `chevron` | Раскрыть/показать подробности или переключить disclosure | `app/pairing-presenter.js; lobby-view.js` | review |
| `dice` | Кубики: тип игры/счётчик; значения рисует отдельный die component | `core/tag-registry.js; core/ui.js indicators` | review |
| `first` | Маркер первого игрока/хода | `app/app.js firstPlayerMode; Ludo preview` | review |
| `exit` | Выйти из аккаунта/группы/партии; объект указан подписью | `app/account-ui.js; group-ui.js; game-screen.js` | review |
| `room` | Комната/лобби/вернуться в лобби | `app/game-screen.js; app/app.js` | review |
| `eye-off` | Скрыть/скрыто в каталоге | `app/pack-manager.js; hub-presenter.js` | review |
| `eye` | Показать/видно в каталоге; роль наблюдения только с отдельной подписью | `app/pack-manager.js; core/ui.js participantGlyph` | review |

## Динамические порты и типы взаимодействия

| Порт | Откуда glyph / что проверено | Ограничение |
|---|---|---|
| GameScreen.iconButton/modalHead/quickActions | Named app action records и surfaceSymbols; full/back/exit/history/rules/settings и статусы имеют конкретные labels | glyph не задаёт surface type; код сценария/typed surface задаёт навигацию, выбранное/disabled/busy состояние |
| Hub pages/types/formats/metadata | pages и formats arrays; core/tag-registry.js; canonical taxonomy cards/board/pieces/solitaire/words/puzzle, duel/three/teams | Иконка типа — информация с текстом, не обещание действия. В15текущих manifests нет root icon field; preview.symbol.icon — отдельный typed descriptor |
| Pack preview symbol / declaration actor | core/packs.js whitelist32 + public manifest values; player/bot actors; bounded preview descriptors | Не угадывать из названия игры; неизвестный metadata glyph не заменяется settings/layers. Physical card/die/heart/meeple/illustrations — самостоятельные shared assets, не этот SVG registry |
| Game menu / actions / pairing rows | action.name, operation menus, route maps; nearby show/listen→sound/mic, transport→wifi/globe/network, QR→camera/image/qr | Действие подписано; disabled permission reason не превращается в новую glyph-команду; no network/auth действия при этой ревизии |
| Participant roles/difficulty/replacement | core/ui.js participantGlyph: bot-easy/medium/hard, hand, grid/eye, replacement; connectionOffline→link-off | Цвет не единственный признак; aria-label/title называет роль/состояние. first — очередность, не статус связи/ведущего |
| Typed indicators / badges | core/ui.js validIndicators/metrics, shared game-components badge; cards/pieces/dice/ship; Snakes effectIcons; Durak takeCards; Mage crown | Registry key host исторически рисует корону: в Mage это ресурс ultimate с числом/подписью, а не чужая роль ведущего |
| Account/cloud/status/save rows | statusIcons и labels maps, off/pending/synced/changed/busy/conflict/error; cloud transfer actions | cloud-check означает подтверждённую синхронизацию; cloud-sync/pending не объявляют успех; glyph+label не заменяют реальные commit/ACK |
| Theme preset / ownership / locks | sun/moon, lock/unlock, selected-check и palette; apply/reset с явной подписью | Видимое selected состояние не равно сохранённому draft, если сценарий использует Save/Cancel |
| ReactionView.icon / rich composer / quick reactions | application/quick-reactions.js whitelist9, reaction-art.css, app/reaction-view.js; portable shortcodes с accessible labels | Это НЕ вызов TabletopUI.icon. :hi:Привет, :thanks:Спасибо, :nice:Хороший ход, :think:Думаю, :hehe:Хе-хе, :wow:Ого, :time:Жду, :challenge:Вызов, :censor:Цензура. Legacy emoji/aliases сохраняют прежние данные; неизвестное значение escapes как текст |
| Caller-supplied labels/glyphs | Общие button factory wrappers сохраняют ariaLabel, type/disabled/active; inputs/radio доступны самостоятельно | Нельзя считать77кандидатных выражений «проверенными» одним resolve; здесь они сгруппированы и связаны с перечисленными живыми источниками. Новый pack/provider расширяет review scope, не наследует его автоматически |

## Осознанное контекстное повторение

- **File-export/import:** принято app-centric направление. Экспорт «в файл» = стрелка в лист; импорт «из файла» = стрелка из листа. Source consumers действительно подписаны так. Root подтвердил не менять/не swapping эту пару без запроса владельца.
- **Refresh / sync / cloud-sync / reset / undo:** близкие метафоры, разные рисунки и подписи. Refresh перечитывает; sync обозначает выполняемую/приостановленную передачу; cloud-sync содержит облако; undo отменяет предыдущее; reset перезапускает обучение/подготовку. Pending refresh не крутит/не морфит glyph: состояние сообщает фон/aria-busy/disabled/подпись.
- **History:** в партии открывает историю; в параметрах обозначает восстановление стандартного состояния через подтверждение. Это допустимая контекстная метафора «к прежнему», а не глобальный command ID; names «История партии»/«Восстановить стандарт» различаются. Документировано по согласованию root, runtime не менялся.
- **Crown/host:** корона используется как публичный игровой ресурс Mage; её нельзя трактовать по одному имени registry как доказательство host authority. Передача ведущего имеет отдельный host-transfer glyph и собственный текст.
- **Gear/settings; back/prev; close/exit:** профильный корень, настройки текущего контекста; возврат родителю, шаг replay; закрытие поверхности, выход из объекта — различены контекстом/подписями. Единый рисунок не разрешает вызывать destructive operation вместо обычного закрытия.

## Итог и статус

Каталог110ключей,105живых consumers/ports и5reserved, девять reaction artworks и контекстные исключения рассмотрены. Блокирующих code-гипотез не оставлено, runtime не менялся; общий каталог обновлён в COMPONENT-STANDARDS.md. Для **ux-021-design-standards рекомендуется check**: реализация+документируемая ревизия готовы к просмотру владельцем. Это не done/полная приёмка36поверхностей и не безусловное признание usability всех icon-only кнопок по atlas.
