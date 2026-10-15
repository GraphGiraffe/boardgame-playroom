# SDK в разработке 0.18

`tabletop-core.zip` сохраняет структуру `tabletop-core/{core,application,presentation,themes,locales}`. Это нужно для одинаковых относительных CommonJS imports и browser source imports; прежняя плоская раскладка не включала зависимости model registration и scheduler. Новый SDK ещё не опубликован.

## Независимые модули

- core/model-runtime.js: GameModel с immutable Position/ActionChoice/Transition/Projection/Result.
- core/model-values.js и core/events.js: JSON/команды и типизированный журнал; проекция перед presentation.
- core/history.js и core/session-codec.js: staging/revisions и компактные сохранения.
- core/command-processor.js: общий transactional pipeline через порты, без transport/DOM/storage.
- core/journal.js: delta event storage и проверяемое восстановление без браузера.
- application/host-recovery.js: целостность состояния/комнаты/receipts и восстановление через переданные engine/Session.
- application/library.js: библиотека с метаданными в заголовке, storage/engine/Session/ID ports.
- application/appearance.js, presentation/localization.js и presentation/scheduler.js: локальные темы, MessageRef и часы показа через порты.

```js
const {GameModel} = require('./core/model-runtime.js');
const History = require('./core/history.js');
const model = new GameModel(gameDefinition); // определение принадлежит паку
const position = model.create(gameOptions);
const history = new History([{revision:0,position}]);
const next = history.prepare(frame => ({revision:frame.revision + 1,
  position:model.apply(frame.position,actor,command).position}));
// Для сетевого authority сначала записать next и receipt в репозиторий.
history.commit(next);
```

Engine registry/Session facade пока связывают переносимые определения с существующей внешней формой кадров. core/ui/input/motion/audio — существующие Web реализации, а не переносимые правила. Эти слои продолжают разделяться по AUDIT-0.18.md; архив не является подтверждением завершённого SDK/API 0.18.

## Метаданные и хранение

Library записывает librarySummary до сериализованной Session одной storage.write операцией. Список читает небольшой заголовок и не восстанавливает историю. Заголовок — индекс для UI; полная проверка кадра, версии и истории выполняется при open. Неподдерживаемые/повреждённые исходные данные сохраняются для явного удаления/экспорта. Индекс не заменяет авторитетное состояние и не используется для игровых прав.

Для новых сетевых записей eventStorage=delta-v1: steps содержат только новые события и eventBase/eventTail, header — eventCursor. Состояние/дельта/receipt/новая revision фиксируются одной IndexedDB transaction. Каждый факт хранится один раз. Восстановление сверяет цепочку cursor и receipts, возвращает короткие хвосты прошлых кадров и полный журнал live кадра. Старый формат пока читается до общего cutover; финальные границы данных определяются полным обновлением.

## Общие компоненты

Канонический RoundToken — playroom-paks/shared/components/round-token.js. Host SDK содержит закреплённую generated копию core/component-assets.js и provenance/digest core/component-assets.json. build.py --packs-dir синхронизирует её с выбранным companion source; автономная сборка без companion проверяет закреплённый digest. Оба pack builder встраивают этот же исходник перед view-kit. Не редактировать generated копию вручную.

Один SVG масштабирует диск, ободок, грань и знак вместе. Видимый размер отличается от hit area. Правила малых жетонов/веера/стопки/финиша описаны в shared/assets/README.md паков. После изменения canonical source обновить vendored digest сборкой и проверить actual components во всех контекстах.


## Lifecycle и представление

`model.start(options)` возвращает `{position,events}`, `model.create(options)` — Position. Начальные комплекты/прочие игровые факты сохраняются так же, как факты хода. Runtime продвигает revision после каждого apply. Необязательные Definition.score/observe возвращают очки и разрешённую память бота; наблюдения бота не становятся частью viewer projection.

Каноническая команда содержит только параметры domain. Presentation.choice/action добавляют подсказки и MessageRef отдельно; Protocol.command строит игровую команду по разрешённой проекции, не по списку исключённых UI-полей. PlayerReference связывается с roster перед локализацией, имен в domain нет.
