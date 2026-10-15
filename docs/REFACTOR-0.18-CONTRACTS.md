# Контракты 0.18 · границы реализации

[План](AUDIT-0.18.md) · [реестр функций](REFACTOR-0.18-TRACKER.md).

Это рабочая спецификация. Реализованные элементы помечены отдельно; таблица целевых структур не означает готовый SDK или новый протокол.

## Владельцы данных и зависимости

| Данные | Владелец | Кто может читать |
| --- | --- | --- |
| Полное состояние, RNG, приватные зоны | Rules + Session authority | Только authority и репозиторий хоста |
| PlayerProjection | ProjectionService | Указанный viewer; Web и другой клиент получают одинаковые права |
| Команда/receipt/revision | CommandProcessor | Связанный клиент; повтор ID возвращает одну квитанцию |
| Комната/roles/seats/team IDs | RoomService | Разрешённый snapshot; без resume secret |
| Scene/players/metrics/results | Pack presentation | Клиент только из разрешённой проекции |
| Selection/scroll/focus/open modal | ScreenController/ViewState | Только локальный UI; не состояние правил |
| Plan effects/queue/shown cursor | PresentationScheduler | Только локальная последовательность показа |
| ThemePreset/locale/speed/audio | Client preferences | Локально; не команда и не история партии |

Domain не импортирует UI, transport, storage или глобальные устройства. Application зависит от портов (Clock, Entropy, IdSource, SessionRepository, Transport). Bootstrap выбирает Web-адаптеры. Presentation не получает полный state ради анимации.

## Целевые структуры

- GameAction: type + параметры правила. UI-подписи и confirmation исключаются из сигнатуры команды посредством отдельной модели, не списка игнорируемых строковых полей.
- GameEvent: id/type/actor/params/visibility. Проектор удаляет приватные параметры до передачи и перевода.
- PlayerProjection: game/version/revision/viewer/public data/own private data/actions/events; без seed, чужих лиц и токенов.
- MetricDescriptor: id/value/format/labelKey/visibility/priority/placement/resultUsage. ID отличает одинаковые числа разных показателей.
- ResultDefinition: winners/places/team results/metric IDs/tie-break facts. UI не решает равенство по русскому label.
- Scene: семейство поля, узлы/объекты с ID, geometry/anchors/actions, player descriptors, presentation effects. HTML/CSS остаются реализацией Web renderer.
- UiSelection: context ID (match/viewer/phase), source ID, target mode; invalidation задаётся семантикой, а не очисткой всего при каждом turn.
- PresentationPlan: ordered effects, minimum visible time, completion/cancel; чтение DOM не определяет policy. Reaction-ready следует после нужного показа.

В четвёртом срезе назначен engineApi 3 для переносимой модели; viewApi 2 и внешний Session envelope пока сохраняются через временный адаптер. Остальные паки ещё используют engineApi 1/2. Это промежуточная миграция, не финальный runtime 0.18.

## ThemePreset и AssetResolver

ThemePreset содержит formatVersion/id/name/baseId, разрешённые palette overrides и asset variants. Встроенные light/dark read-only; custom создаётся копией с собственным ID. Preview живёт отдельно до save, cancel восстанавливает выбранный сохранённый preset. Удаление активного custom возвращает light. Ошибка чтения/неизвестный вариант приводит к базовому preset/asset без изменения игры.

Palette slots: surfaces/text/borders/shadows; interaction.available/selected/target/invalid; feedback.success/error/addressed; game side/team colors; material face/rim/side/mark. Разные смыслы не связывать одним зелёным токеном.

Asset key: family + variant + semantic value + presentation palette. RoundToken один для фишки/первого/команды/медали; stack/fan/cell/triangle — функции layout. Card face/back и die face не меняют ID, значение, скрытость или hit area. Другой клиент может использовать свои renderers при тех же значениях.

Переключатель сохранённых пресетов в toolbar работает и в игре; редактор в главном меню. Theme change не dispatch action и не пересоздаёт всю сцену. Общие ассеты остаются каноническими в packs/shared; Web shell включает закреплённую версию при сборке.

## Локализация

Catalog — отдельные data-файлы namespace/locale, без исполняемого кода и произвольного HTML. MessageRef содержит key и именованные params. Типизированные значения (rank/actor/count/date) форматирует клиент. Plural поддерживает one/few/many/other; fallback к ru или явный diagnostic для неизвестного ключа. Domain выбрасывает коды ошибок, presentation переводит их. Перевод скрытого события выполняется только после проекции.

Тексты metadata/rules/actions/events/help/errors/aria принадлежат приложению или паку; длинные правила — структурированные блоки/Markdown. Данные пользователя экранирует renderer. Ресурсы локали поставляются offline в HTML/PWA/паке, язык не влияет на signature/seed/history. В текущем этапе полный перенос текста ещё не выполнен.

## Первый реализуемый срез

- `core/random.js`: seedValue(value, entropy), random(state, entropy), shuffle(items,state,entropy), rollDie(sides,state,entropy). Нет DOM, часов и собственного ambient RNG; при отсутствии state нужен явный entropy provider. Текущий engine передаёт Math.random на своей границе. Алгоритм и порядок вызовов остаются прежними.
- `shared/domain/standard-deck.js` в репозитории паков: create(36|52|54,{exclude:ids}). Возвращает новые карточные объекты в прежнем порядке, не тасует и не знает правил игры.
- Manifest source field sharedDomain перечисляет имена модулей без путей; оба source builder встраивают их перед rules.js. Доставленный JSON не требует runtime-загрузки из соседнего checkout.
- Node/CommonJS и browser source registration — адаптеры загрузки одного исходника; новый API/legacy runtime этим не вводится.

Проверки: зафиксированные прежние RNG/shuffle vectors, headless VM без browser globals, состав/порядок/исключения/независимость колод, равенство bundle обоих builders и реальное исполнение правил четырёх паков из автономного JSON. Существующие engine/rc2-games проверяют игровой контракт. Полные layout/network suites к этому срезу не относятся.

## Второй срез: модели оформления и переводов

Реализованы независимые `application/appearance.js` и `presentation/localization.js`. Публичные данные находятся в `themes/{light,dark,assets}.json` и `locales/ru/{common,themes}.json`, входят в архив исходников. В следующем срезе модели подключены к Web UI, как описано ниже; перенос всех остальных текстов и материалов ещё впереди.

`ThemeCatalog` проверяет полные наборы семантических цветов (HEX6) и семейства ассетов, фиксирует встроенные пресеты. `AppearanceService` принимает синхронные порты `repository.read/write` и `idFactory`. Операции createDraft/preview/cancelPreview/saveDraft/select/rename/remove; snapshot/list/active/shown/subscribe для UI. Сначала запись, затем изменение активного состояния; отказ storage сохраняет draft/preview и прежние настройки. Копия не зависит от сохранности своего источника. Неизвестный вариант ассета получает стандартное отображение с сохранением запроса; повреждённые записи изолируются, доступны коды предупреждений. Удаление активного custom возвращает light. Ошибка UI-подписчика не отменяет уже выполненное сохранение. Предел — 32 пользовательских пресета.

`Translator` получает каталоги и locale/fallback. text(key, params) и format({key,params}) возвращают текст; renderer обязан экранировать его или использовать textContent. Plural-формы выбираются по языку фактически найденного сообщения, в том числе при fallback. Снимок каталога неизменяем, язык меняется через withLocale без изменения state/events. number/date используют Intl; для даты timezone по умолчанию UTC, не текущие часы. Неизвестные ключи, некорректные каталоги и параметры дают стабильные коды ошибок. Формат каталогов — плоский namespace.key → строка либо объект plural с обязательным other; составные переводы/Markdown-справка будут подключаться отдельным renderer.

Проверено `node scripts/codex/test.cjs core/appearance,core/localization` — 16/16. Проверки подтверждают независимость от DOM/хранилища браузера/движка, immutable builtins, копирование, preview/cancel/save, storage rollback, локальность клиентов, fallback ассетов/локали и русский plural. Это проверка моделей, не визуальная приёмка тёмной темы и не завершение переноса всех текстов.


## Третий срез: Web-адаптер и редактор оформления

- `app/appearance-web.js` связывает независимые модели с `localStorage` (`playroom.appearance.v1`), CSS custom properties, `color-scheme` и `meta[name=theme-color]`. Персистентный формат проверяет сервис; storage не передаётся в domain. Применение оформления публикует только `document` event `playroom:appearance`, без игровых команд и без `playroom:game-options`.
- `app/appearance-ui.js` — Web renderer диалогов и обработчики ввода. Нативный `<dialog>` находится вне `#modal-root`: переключение не вызывает старый `openModal`, не останавливает анимацию/повтор, не пересоздаёт сцену или уже открытую модальную настройку. Закрытие возвращает фокус и положение страницы. Жесты внутри поля не переподключаются из-за темы.
- В главном меню «Темы и скины» заменяют боковую/нижнюю справку; справка остаётся в верхней панели. Редактор доступен только из главного меню. Можно копировать light/dark/custom, менять название и палитру с preview, отменять, сохранять, удалять с подтверждением. Builtins не редактируются. Все подписи/ошибки/aria этого модуля находятся в JSON каталоге.
- Быстрый выбор встроенной/сохранённой темы доступен из верхней панели и настроек, в том числе во время локальной партии, просмотра истории и projected network screen. На 320 px кнопка остаётся в настройках, чтобы не вытеснять название и обязательные действия. Fullscreen на узком главном экране также доступен из настроек.
- 54 семантический цвет охватывает shell, панели, состояния, поля редактора, счётчики флота и score table. CSS приложения и общих контролов/таблиц паков использует `--color-*` с автономными fallback. Геометрия этих компонентов не меняется при выборе темы.
- Пак не оформляет `.game-tile` главного меню: canonical `manifest.tileTheme` и renderer приложения определяют её цвет. Убраны старые overrides пяти паков. Ятзи и общий шаблон ScoreTable используют одинаковые семантические слоты заголовка, закреплённой колонки, итогов и доступных значений. Общие tabs/actions/hints используют палитру клиента.
- `build.py` генерирует игнорируемый `app/appearance-models.js` из двух независимых исходников и JSON, проверяя повтор ключей локали. Это сборочный Web entrypoint, не вторая реализация сервисов. После изменения моделей/JSON нужно выполнить `python3 build.py --prepare-dev --all-games --packs-dir ../playroom-paks/packs` перед браузерной проверкой. Runtime включён в offline HTML, source archive и хешированные index/SW ресурсы PWA.

Семейства skins пока содержат только classic: выбора несуществующих вариантов нет. Атрибуты `data-skin-*` и каталог — точка подключения будущего AssetResolver; переключение палитры внутри каждого SVG/data-image, все pack-specific surfaces и полное разделение view/domain не объявляются завершёнными. Принятое старое поле Лудо и игровые цвета не заменяются этим срезом.

Регрессии `ui/appearance` проверяют preview/cancel/save/reload/delete, immutable builtins, геометрию редактора 320/390/740 px, контраст таблицы в dark, сохранность DOM/двух осей scroll/истории/открытой настройки/сохранения и отсутствие игровой команды на projected client. Проверка projected client использует настоящий authority/client через LocalTransport; это не повторная проверка WebRTC reconnect.


## Четвёртый срез: независимые правила, события, проекции и сцена

`core/model-runtime.js` содержит GameModel и ModelError. Он не импортирует UI, локализацию, storage, transport, часы или RNG. GameDefinition contractVersion=1 предоставляет create/validate/actions/reduce/project/result и необязательный bot. Модель принимает и возвращает immutable JSON, проверяет состояние, команды, переходы, события и результаты. Ambient randomness отсутствует; порт случайности для следующих игр будет добавлен явно.

| Контракт | Реализованная форма |
| --- | --- |
| Position | playerCount, turn, status, winners, data |
| ActionChoice | command={type, параметры}, visibility=public/private |
| Transition | position + events; исходное состояние не меняется |
| Event draft | type, actor/null, params, visibility={kind:public} либо {kind:players,players:[индексы]}; необязательный publicEvent |
| Projection | contractVersion, game, viewer, actor, audience, playerCount, turn, status, winners, явные data/actions/events |
| Result | winners, places, metrics=[{id,values}]; места определяют правила |
| Scene Крестиков-ноликов | board geometry, стабильные cell IDs, owner/mark/command/MessageRef, player marks и типизированные metrics |

Команда сравнивается по каноническому JSON с упорядоченными ключами; label/confirmation не входят в модель. Дополнительные поля не проходят как легальное действие. Rules выбирают исход и публикуют типизированные события. projectEvents фильтрует приватные параметры **до** presentation/перевода, publicEvent — отдельное безопасное событие. Нормализация неизвестного viewer даёт Зрителя. bot получает разрешённую проекцию и список канонических команд; его выбор снова проверяется.

**Стол — Зритель плюс публичные действия игроков.** projectTable сохраняет зрительские data/events и viewer=-1, добавляет отдельный actor и только публичные команды. Приватность определяется объявлением правила, включая аргументы и доступность, а не названием игры или видимостью результата. Руки видны рубашками либо лицами в режиме открытых рук; кубики публичны; обе расстановки Морского боя скрыты во время партии. Полный контракт и состояние сетевого подключения — [MULTIVIEW](MULTIVIEW.md).

`app/model-adapter.js` связывает GameModel с существующим Session/engine envelope и Translator. Это временная граница миграции: создаёт старые UI labels вне domain, передаёт канонические команды, публикует события и переводит первый result metric для старого экрана результатов. Адаптер сейчас принимает только публичные события; private drafts запрещены до переноса Session projection/event IDs. Canonical draft ещё не имеет durable ID/revision: их продолжает назначать Session. Персистентный event pipeline, все result metrics/tie-break facts и сетевое действие Стола остаются следующими этапами. При окончательном переходе адаптер и старые runtime контракты удаляются.

`core/packs.js` получает modelAdapter как внедрённый порт от Web bootstrap; scoped PlayroomPack.adaptModel возвращает описание для scoped TabletopCore.register. Staging не изменяет основной реестр. В core нет импорта app/presentation. Node-хост перед raw source registration загружает app/model-adapter.js; загрузчик может получить свой modelAdapter. Web entrypoint/precache содержат runtime и адаптер. Remote catalog и authority whitelist поддерживают engineApi 3/modelProjection.

Эталон — Крестики-нолики 0.2.0, engineApi=3, stateVersion=1: domain/game.js, presentation/scene.js, locales/ru/game.json и Web view.js. Знак X назначен фактическому первому игроку; renderer не выводит знак из индекса. Форма сохранённого board/marks не меняется, packVersion остаётся точной. Старая оболочка отклоняет engineApi 3. Другие игры ещё не перенесены.

Source manifest sourceModules задаёт упорядоченные rules/view модули и JSON locales; оба сборщика встраивают их в автономные entrypoints, удаляют служебное поле и сохраняют исходники в files. Результат не зависит от соседнего checkout/CDN. Оба сборщика пока содержат одинаковый compiler helper; тест проверяет равенство результата и отказ некорректных путей/локалей. Объединение compiler/validators — отдельный этап контейнера.
