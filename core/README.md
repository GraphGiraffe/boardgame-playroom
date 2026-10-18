# Tabletop Core · 0.18.0

Ядро ХОД исполняет GameModel API 3 и не зависит от DOM, IndexedDB или WebRTC. Правила, представление, локализация и Web renderer разделены. API 1/2 не поддерживается; старые примеры с `Core.register({create, legal, apply})` не являются контрактом этой версии.

## Подключение

Это исходный SDK, а не опубликованный npm-пакет. `tabletop-core.zip` сохраняет папки `core`, `application`, `presentation`, `platform`, `themes`, `locales` и `docs`, чтобы относительные импорты оставались рабочими. Игры поставляются отдельной коллекцией; их определения регистрируются до создания/восстановления Session.

Пример из корня подготовленного checkout приложения (после setup с companion):

```js
const Core = require('./core/engine.js');
const Session = require('./core/session.js');
require('./packs/tictactoe/rules.js');
const session = new Session(Core, 'tictactoe', {
  seed: 17, firstPlayerMode: 'assigned', firstPlayer: 0,
  players: [{name: 'Анна'}, {name: 'Борис'}]
});
const actor = session.current.turn;
session.act(actor, Core.legalActions(session.current, actor)[0]);
const view = session.view(actor);
```

Web loader подключает проверенный пакет с его зависимостями; нельзя заменять его сокращённым набором script-тегов из старого SDK. Browser globals `TabletopCore` и `TabletopSession` — адаптеры тех же контрактов, а не отдельный движок.

## Границы модулей

- `model-values`, `model-runtime`, `model-registration`, `engine`: проверка Definition/Position/Transition, регистрация, разрешённые действия и audience projection.
- `session`, `session-codec`, `history`: неизменяемые кадры, точная версия пака, архив и воспроизводимость. Экспорт содержит скрытые данные и не отправляется гостю.
- `authority`, `command-processor`, `journal`: права, revision, дедупликация commandId, durable commit до ACK. Хранилище/часы приходят через порты.
- `ui`, `input`, `motion`, `audio`: необязательные адаптеры общего ввода и оформления. Они получают разрешённое представление; не вычисляют игровые правила и не раскрывают приватные события.
- `application`: управление экраном, историей, комнатами, восстановлением и обновлением. `platform/web` реализует браузерные порты.

Новая игра использует Definition API 3, чистую domain-модель, presentation и locales. Примеры регистрации и полный контракт — [SDK](../docs/SDK-0.18.md). Схема слоёв — [архитектура](../docs/DEVELOPER-ARCHITECTURE.md), контейнер — [формат пака](../docs/PACK-FORMAT.md), жесты/сцена — [UI API](../docs/GAME-ELEMENTS-API.md), понятные названия механизмов — [реестр](../docs/MECHANICS.md).

## Проверка

Из полного checkout: `node scripts/codex/test.cjs core,input` для ядра/ввода. Сетевые, storage и игровые изменения требуют соответствующих блоков; самостоятельный тест чистой модели не доказывает работу Web UI или сети. [Выбор проверок](../docs/TESTING.md). Для stable 0.18 выполняются все семь блоков и отдельная проверка поставляемых архивов.
