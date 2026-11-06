# Общий интерфейс и платформа: итерация03

Статус: локальная реализация заморожена; адресные проверки завершены. Сборку и публикацию этот агент не выполнял. Итоговая сборка и независимый просмотр её HTML остаются у root.

## Реализация

- Общий заголовок: семантическая иконка слева, название до двух строк, статус одной строкой. На полноэкранных поверхностях справа отдельные44px кнопки fullscreen и Back; Back крайняя справа. Панели, окна и диалоги fullscreen не показывают. В игровом заголовке Back не добавлен, поскольку выход из партии является отдельным действием. Fullscreen доступен и на четырёх корневых экранах через тот же helper; прежняя строка в Доступности удалена.
- Нормализация заголовка идемпотентна: canonical glyph marker исключает повторную замену SVG, title и последний Back меняются только при отличии. Пустой `<h2></h2>` сохранён для native chat identity. Нормализация выполняется до подключения DOM через необязательный `prepareSurface` порт существующего ModalController. Platform не импортирует app. Существующая идентификация собеседника сохраняется.
- История убрана из быстрых действий игрового заголовка и сохранена в меню партии; действия истории сохранённых партий не менялись. Меню партии показывает Паузу и На главную непосредственно в основном списке. Редкие действия остаются отдельными пунктами, без обязательного пустого spoiler.
- Портретный launcher чата перенесён к правому краю на высоту реальных счётчиков карточки игрока. Для него зарезервировано место; счётчики и маркер порядка не перекрываются. Фон соответствует окружающей игровой зоне/активной карточке. В landscape инструменты находятся справа сверху,52px резервируются только внутри собственной зоны игрока; поле не сдвигается вниз.
- Панели закрываются движением вниз по свободной области. Реальные поля ввода, кнопки, списки, чат, скроллеры, переносимые элементы и выделенный текст исключены. Короткий/отменённый жест возвращает панель; завершённый жест не нажимает элемент под панелью. Потеря implicit capture дочерней SVG-иконки больше не отменяет захват самой панели.
- Карточка сохранённой партии целиком открывает меню всех доступных действий, включая Продолжить. Сохранены исходные data-атрибуты и данные карточки. Обработчик меню закрывает собственную панель до делегирования cloud/continue; UX-агент убрал старый swipe/direct-open.

## Поле и рука игрока

Общая `landscapeZones` сохраняет приоритет квадрата поля по доступной высоте, затем распределяет место между компактными оппонентами и собственной рукой; минимальная собственная зона140px сохраняется на узких размерах. Это общий алгоритм, без game/browser ветвей. При740×390 Mage и Домино сохраняют квадрат364×364 и реальные элементы руки под верхними инструментами. В844×390 остаётся тот же квадрат. Короткое название Домино не переносится из-за повторного вычитания12px от уже отступленного заголовка.

Адресный existing geometry case проверяет15паков, исчезновение рук без движения поля и возврат portrait→landscape→portrait с исходной строгой погрешностью1px. Реальные узлы рук восстанавливаются до поворота; новая фикстура создаёт локальный профиль до goto, чтобы onboarding не перекрывал снимки. Обе engine:16/16 PASS, exit0. Mage/Domino740PNG просмотрены отдельно, без overlay.

## Fullscreen и лишние операции

В реальной партии Mage исследован один и тот же сценарий: кнопка fullscreen и три native viewport resize, с сохранением идентичности `.scene`.

| Наблюдение | До | После |
|---|---:|---:|
| Повторная запись неизменённого заголовка |8|0|
| Сериализация SVG-art через outerHTML |5|0|
| Суммарная длина сериализованных строк |388400 code units|0|
| Resize-события контрольного сценария |3|3|
| Исходный `.scene` после сценария |тот же|тот же|

В исходном замере сериализация занимала около1.2ms; это небольшая устранимая работа, а не доказанная главная причина задержки на телефоне. Длительности headless-проходов меняются с нагрузкой; ускорение физических iPhone/Pixel или FPS по этим числам не заявляется. Полное число вызовов render/layout не измерялось: CPU samples не являются счётчиками вызовов. Необходимые layout/RAF-проходы сохранены.

`fitGameTitles` не заменяет тот же текст. `fitCovers` использует прежний локальный WeakMap с per-art MutationObserver: dirty-флаг и `takeRecords()` учитывают мутацию того же узла до callback, без копирования markup при cache hit. Сохранены версия assetGeometry, повторная попытка после нулевого BBox и измерение без cache при отсутствии observer. SVG с text/textPath/foreignObject всегда измеряются заново. Existing fullscreen profile проверяет immediate attribute/child mutation, изменение и восстановление BBox, отсутствие лишнего BBox на cache hit и отсутствие cache для font-dependent art.

В отчётах историческое поле `coverSignatureBytes` записывает string.length: это code units, а не измерение heap allocation/UTF8 байтов. Таблица выше намеренно использует правильную единицу.

## Проверки

Использованы существующие cases через `node scripts/codex/test.cjs`, с предварительным `--list`:

- `case/game-screen`:24/24.
- `case/game-layout-browser`, `collection scene geometry survives hidden hands and portrait landscape round trips`:Chromium16/16, WebKit16/16.
- `case/pairing-methods-browser`, `nearby choice 0.21: shared panels retain the source and reject stale options`:1/1 в каждой engine. Desktop/touch × normal/reduced motion, настоящий scroll, сохранение selection, свайп по пустой области, быстрый Back/reopen и stale controls.
- `case/history-library-layout-browser`, `hub fullscreen fallback preserves document scroll and modal locking on both pages`, с `PLAYROOM_PROFILE_UI=1`:1/1 в каждой engine. Четыре корневых fullscreen-входа, retained scroll/locking, MyGames refresh, SVG-cache mutation и counters; повторная нормализация native header сохраняет тот же SVG/Back и даёт0 childList/attribute writes.
- `case/lobby-layout-browser`, `game overlays 0.21: room context, native menu focus and resized RTC chat preserve the scene`:1/1 в каждой engine. Настоящий локальный RTC, сцена/меню/Settings/Back, отдельные44px controls, правый launcher и неперекрытые метрики, room/team reply/reaction/read/privacy, retained dock→group→Back. Включает замороженную оптимизацию `application/room-chat.js` кодера. В обоих отчётах nativeSupabaseRequests=0, errors=[].

Последний повтор geometry выполнен последовательно: параллельные две engine одного case столкнулись по общему runner log; этот промежуточный exit1 не считается PASS и заменён отдельным exit0 Chromium-проходом. Продукт для этой проблемы не менялся.

Последние runtime-дельты после RTC/panel green — удаление повторного inline inset ширины игрового heading и идемпотентность prepaint policy. Финальный geometry обоих движков покрывает ширину; unit24/24 и fullscreen-profile обоих движков покрывают normalizer/native DOM identity. Остальные сценарии без оснований не повторялись.

## Артефакты и границы

Артефакты: `tmp_files/ux-021/owner-iteration03/ui-platform/` в корне workspace. `final-manifest.json` фиксирует SHA256 общих файлов, команды/результаты, reuse delta и ограничения; это снимки файлов с сохранёнными изменениями других агентов, не заявление авторства всего diff. Рядом финальные логи, JSON, CPU profile и чистые Mage/Domino740PNG. Базовые title/serialization отчёты сохранены отдельно.

Chromium touch использует native CDP touch. WebKit dismissal использует controlled PointerEvents и настоящий wheel scroll: это не сертификация физического iPhone. Старые RTC gameheader844PNG до последней width-коррекции не используются как финальная приёмка этого названия. Полная независимая приёмка всех экранов и итогового HTML не подменяется этим адресным проходом.

## Последнее уточнение владельца: fullscreen только на экранах

Raw `modalHead` не добавляет fullscreen до определения типа. Общий normalizer сначала читает фактический `data-ui-surface` ближайшей поверхности, затем явный параметр уже типизированного detached content, затем существующую class policy. Только `screen` получает собственную кнопку `[data-surface-fullscreen]`; у `panel`/`dialog` удаляется только такая собственная кнопка. Back остаётся крайним справа, независимо от fullscreen. Обновление modal сохраняет его фактический тип; nonmodal game chat передаёт panel явно. Корневые четыре экрана и игровой экран сохраняют fullscreen.

Адресные проверки этого уточнения сохраняются отдельно с префиксом `screens-only-`: unit и те же fullscreen/panel/actualRTC cases; все15packs и backend повторно не запускались. Native header assertion проверяет конфликтующий класс settings при фактическом panel/dialog, отсутствие fullscreen в raw header, наличие только на screen, сохранение той же Back и идемпотентность. Actual RTC дополнительно проверяет отсутствие History в gameheader, наличие в menu, отсутствие fullscreen у menu/drawer и сохранение его у Settings screen. Финальные статусы — в `screens-only-manifest.json` рядом с предыдущим manifest.

Последнее уточнение принято локально: unit24/24, fullscreen/panels/actualRTC по1/1 в Chromium и WebKit, каждый процесс exit0. RTC/fullscreen reports: nativeSupabaseRequests=0, errors=[]. Снимки gameheader и gameMenu после уточнения просмотрены; новые product source изменения после freeze не вносились.
