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

Версии API назначаются при согласовании executable схем. В первом переносе новые структуры ещё не заменяют текущие engineApi 1/2 и viewApi 2.

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

Реализованы независимые `application/appearance.js` и `presentation/localization.js`; они ещё не подключают редактор/переключатель к существующему Web UI. Публичные данные находятся в `themes/{light,dark,assets}.json` и `locales/ru/{common,themes}.json`, входят в архив исходников. Новые каталоги и модули станут runtime-ресурсами при подключении нового bootstrap; действующая оболочка пока не меняет палитру.

`ThemeCatalog` проверяет полные наборы семантических цветов (HEX6) и семейства ассетов, фиксирует встроенные пресеты. `AppearanceService` принимает синхронные порты `repository.read/write` и `idFactory`. Операции createDraft/preview/cancelPreview/saveDraft/select/rename/remove; snapshot/list/active/shown/subscribe для UI. Сначала запись, затем изменение активного состояния; отказ storage сохраняет draft/preview и прежние настройки. Копия не зависит от сохранности своего источника. Неизвестный вариант ассета получает стандартное отображение с сохранением запроса; повреждённые записи изолируются, доступны коды предупреждений. Удаление активного custom возвращает light. Ошибка UI-подписчика не отменяет уже выполненное сохранение. Предел — 32 пользовательских пресета.

`Translator` получает каталоги и locale/fallback. text(key, params) и format({key,params}) возвращают текст; renderer обязан экранировать его или использовать textContent. Plural-формы выбираются по языку фактически найденного сообщения, в том числе при fallback. Снимок каталога неизменяем, язык меняется через withLocale без изменения state/events. number/date используют Intl; для даты timezone по умолчанию UTC, не текущие часы. Неизвестные ключи, некорректные каталоги и параметры дают стабильные коды ошибок. Формат каталогов — плоский namespace.key → строка либо объект plural с обязательным other; составные переводы/Markdown-справка будут подключаться отдельным renderer.

Проверено `node scripts/codex/test.cjs core/appearance,core/localization` — 16/16. Проверки подтверждают независимость от DOM/хранилища браузера/движка, immutable builtins, копирование, preview/cancel/save, storage rollback, локальность клиентов, fallback ассетов/локали и русский plural. Это проверка моделей, не визуальная приёмка тёмной темы и не завершение переноса всех текстов.
