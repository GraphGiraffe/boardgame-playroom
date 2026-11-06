# Широкая CSS-инвалидация и резерв действий — 4 ноября 2026

Статус: исправлено, адресные проверки пройдены, временное превью опубликовано и проверено. Полная GOAL 0.21 открыта: остаточная задержка и миграция остальных сцен не закрыты.

## Причина и изменение

Контролируемый профиль окончательного предыдущего превью показал длинную задачу 99 мс на одном ходе Spider. Дополнительная invalidation trace связала пять инвалидаций поддерева body внутри клика с правилом `.app-game-layout[data-seating="circle"] .layout-actions:has(.shared-hint):not(:has(button)) *`. Само правило не должно было менять пасьянс, но его универсальная правая часть участвовала в широкой браузерной CSS-инвалидации.

В `app/design-system.css` универсальный `*` заменён на `:where(.game-action-bar,[data-action-position],.shared-hint)`: сброс min-height относится к стандартным компонентам панели подсказки. В сопоставимых trace с invalidationTracking число широких инвалидаций, приписанных этому правилу внутри клика, сократилось 5→0; другие причины остаются.

Выбранная существующая геометрическая проверка обнаружила отдельный конфликт позднего CSS: строка `.scene-actions` и её кнопки были уменьшены до32px, перекрывая резерв44px. Возвращены44px и для строки, и для кнопок. Первоначальный assertion44px не ослаблен; поле, рука и метаданные сохраняют геометрию при появлении действия.

Изменён только один из230runtime-файлов приложения — `app/design-system.css`. Все15объектов паков, правила, motion renderer и shared assets побайтно/JSON-идентичны предыдущему кандидату. SVG-style фильтр не возвращался, необходимые анимационные снимки не удалялись.

## Измерение окончательного HTML

| Показатель | Предыдущее превью | Окончательное превью |
|---|---:|---:|
| Длинная задача в выбранном ходе | 99мс | 79мс |
| Click EventDispatch | 90,352мс | 76,685мс |
| UpdateLayoutTree внутри клика, суммарно | 17,153мс | 4,473мс |

Одинаковы Chromium156.0.8078.47, viewport740×390, CPU1×, sampling1000µs, seed17, точный fixture SHA, исходное состояние SHA, выбранное действие, точка/прямоугольник цели и normal animation340ms. Оба хода завершились move0→1, busyfalse, errors[]. `comparison.json` фиксирует равенство входов. Текст сценария получил необязательную настройку trace categories между замерами; в данной паре категории одинаковые стандартные, а последовательность измеряемого ввода не менялась.

Это один контролируемый эпизод с профилировщиком, не статистика INP/FPS, не телефон и не вся коллекция. 79мс по-прежнему длинная задача; ускорение всех действий и устранение общего построения recipe не заявляются.

## Проверки и промежуточные ошибки

- `case/game-layout-browser --name 'all packs share player panels and preserve geometry across reported screens, replay and rotation'`: окончательный CSS Chromium179/179 и WebKit179/179 PASS. Это178дочерних случаев и родитель:176состояний пяти игр/поверхностей/live/replay/размеров, длинные имена/счётчики и условные действия Durak/Domino с сохранением геометрии.
- `native font preference preserves representative card dice and board game panes`: окончательный source Chromium1/1 PASS,12состояний UNO/Ludo/Domino, portrait/landscape и реальный defaultFont16/32. Это source-проверка, а не независимый final HTML прогон; source ZIP подтверждает соответствие CSS.
- Окончательный HTML: controlled Spider выполняет реальную команду, сохраняет точный hash загруженного файла и source/target geometry. Просмотрен `final-profile/clean-after.png`; просмотрен Domino390px из последнего native-font source-прогона. Эти два снимка не заменяют визуальную приёмку всей коллекции.
- Старый browser fixture выбранного большого case не загружал vector/card/avatars dependencies: оба начальных запуска завершились до cases с отсутствующим PlayroomViews. Восстановлен порядок зависимостей по другим рабочим cases этого же файла. Следующие оба запуска выполнили177/179, обнаружив резерв32px. Для ошибки добавлены только game/viewport/before/after в assertion message; после исправления CSS оба179/179 прошли. Исходные функциональные assertions сохранены.
- Начальная попытка профилирования не обновила старый селектор из-за неверного cwd и всё же запустила runner; затем актуальный переход открыл точный отказ старому сохранению Spider0.2.5-preview.2. Эти неудачи не приняты как замеры. Для текущего пака0.2.5-preview.3 создана новая canonical Session seed17 с теми же options; data и rng совпадают с историческим исходным состоянием, пользовательские/старые сохранения не конвертировались. Старый seed17 fixture сохранён; новый передаётся необязательным PLAYROOM_PERF_FIXTURE.
- Первый CSS-эксперимент с direct-child :has не уменьшил широкие инвалидации:14body/html и5main сохранились. Разница99→95мс в одном прогоне не принята как ускорение. Эти три CSS-файла восстановлены из точных backup; в финал вошла только описанная правка design-system.css. Экспериментальные geometry/font проверки не переименованы в окончательные.

## Сборка и публикация

HTML SHA256 `2433e7574cbecca4cb6a2c5b1ef77920a77a1c2f4c8d7cf3589d7e63e567c67a`.
Cache `playroom-pwa-v0.21.0-preview.1-6061269ee3e28d28`.
App0.21.0-preview.1, collection0.8.9-preview.7; паки прежние. 8SHA256/3ZIP CRC/250source-файлов сверены; финальный source drift0.

Разрешённые временные https://seth.tail6aebd4.ts.net/ ,8443 и `/hod-021.html` обновлены. Public4files совпали побайтно; весь standalone сверён диапазонами64KiB с206/Content-Range/length и общей SHA. Внешний системный Chromium без WebKit LD_LIBRARY_PATH: activatedworker, точныеcache/buildIdentity,15игр,downloadProtocol1; offline reload/coldPage/Domino/saved session/profile PASS;6viewport states безoverflow; errors[],nativeSupabaseRequests0,sourceDrift[]. Static `/api/packs/catalog` не является защищённым pack API. Реальная доставка Push не проверялась. Stable/SQL/R2, соединения и посторонние службы не менялись.

[Evidence](../../../tmp_files/ux-021/scene-profile-1104/): final-manifest.json,source-state.json,comparison.json,current-compatible/final-profile,invalidations/actions-invalidations,css-baseline,final-layout-chromium/webkit.log,final-native-font.log,public-check.json,live-pwa. Старые неудачи и отклонённые сборки сохранены отдельно. `scoped-candidate` и `actions-candidate` — промежуточные, не текущие опубликованные артефакты. Текущий — `final`.

Остаются остаточная длительная задача, общий recipe/точечные зависимости других сцен, полная A01–A36, независимая usability, физические устройства/сети/AT/слышимость. Их требования не переносятся автоматически в следующий SDK-релиз.
