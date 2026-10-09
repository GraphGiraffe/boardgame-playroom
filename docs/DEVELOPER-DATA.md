# Данные, версии паков, локальные сохранения и форматы файлов (RC6)

[← Индекс](DEVELOPER-INDEX.md) · [Архитектура](DEVELOPER-ARCHITECTURE.md) · [Игровой цикл](DEVELOPER-GAMEPLAY.md) · [Сеть и resume](DEVELOPER-MULTIPLAYER.md) · [Pairing](DEVELOPER-PAIRING.md) · [Сборка](DEVELOPER-WORKFLOW.md)

**Важно:** хранилище **локальных** партий и сохранённый секрет возвращения в **сетевую** партию — два разных механизма. RC6 **не** записывает полный сетевой authority/Session у хоста и не восстанавливает игру после закрытия хостовой вкладки.

## 1. Таблица постоянных данных браузера

| Ключ / область | Кто пишет/читает | Форма и назначение |
| --- | --- | --- |
| `playroom.player-profile.v1` | `app/multiplayer.js:ProfileStore` | JSON `{version:1,id,name,createdAt,updatedAt}`. Публичный ID профиля и имя; **не удостоверяют игровое место** |
| `playroom.settings.v1` | `app/app.js` | JSON `{sound,volume,animationSpeed,quickPlay}`; настройки одного браузера |
| `playroom.packs.v1` | `core/packs.js:TabletopPacks` / `app/pack-manager.js` | JSON `{format:'playroom-packs',formatVersion:1,packs:[...],active:{...},removed:[...]}` |
| `playroom.session.v1` | `app/library.js:PlayroomLibrary` | Активная **локальная** партия; compact session JSON, поле `libraryId` |
| `playroom.paused.v1.<id>` | `PlayroomLibrary` | Прочие локальные партии и завершённые повторы; сохраняются отдельно |
| `playroom.acoustic-known-addresses.v1` | `app/network-ui.js` | Массив до 8 IPv4, введённых пользователем; **не** автообнаружение сети |
| `playroom.network-resume.v1.<roomId>` | `app/multiplayer.js:ResumeStore` | JSON `{version:1,roomId,participantId,token}` — приватная гостевая capability, не экспортировать в QR/снимки |
| PWA `CacheStorage` `playroom-pwa-*` | `sw.js` | Статическая оболочка, кэшируемые JS/CSS/HTML/встроенные паки, не сервер авторитетной игры |

Все данные относятся к **origin/контексту браузера**. Разные браузеры/устройства, изменения `file://`/`content://` идентичности и очистка site data не гарантируют доступ к прежнему `localStorage`. Не полагайтесь на сохранение в новом файле по другому URL как на миграцию данных. Токен возврата является bearer-capability — не выводить его в консоль, UI, JSON комнаты или ссылки.

## 2. Движок и форматы состояния партии

`core/session.js:TabletopSession` использует внешний envelope:

**Plain export / сохранение v1:**

```json
{
  "format": "playroom-session",
  "version": 1,
  "game": "GAME_ID",
  "packVersion": "0.2.1",
  "options": {},
  "createdAt": 0,
  "updatedAt": 0,
  "states": []
}
```

Это описание **ключей**, не допустимая сохраняемая партия: `states` должен содержать последовательность валидных состояний, отметки времени должны соответствовать условиям restore. `Session.export()` отдаёт plain JSON-совместимый объект.

**По умолчанию `session.serialize()`** выдаёт компактный JSON:

```json
{
  "format": "playroom-session",
  "version": 2,
  "encoding": "interned-json-v1",
  "game": "GAME_ID",
  "packVersion": "PACK_VERSION",
  "options": {},
  "createdAt": 0,
  "updatedAt": 0,
  "states": [],
  "journal": [],
  "nodes": []
}
```

`states` здесь **кодированные**, `nodes` — interned значения, `journal` — текущие события. Не пытайтесь прочитать `states[]` компактного envelope как голые `GameState`; используйте `TabletopSession.restore(engine,saved)`. Метаданные `libraryId` дописывает `PlayroomLibrary.encode(session,id)`.

`Session.packVersionOf(saved)` берёт явную `packVersion` (или legacy из options/state) и использует `0.1.0` только для старых сохранений без версии. `restore` проверяет все состояния по `engine.validateState` и последовательность ходов/игроков/версии. Повреждённый или несовместимый envelope не подменяется автоматически; UI показывает предупреждение и сохраняет сырую запись до решения пользователя.

**Локальная библиотека:** `app/library.js`:
- `records()` собирает `playroom.session.v1` и все `playroom.paused.v1.*`, убирает дубликат активной записи;
- `list()` создаёт карточки (game/version/mode/players/move/result/updatedAt) и отдельные `invalid`/`missingPack`;
- `activate(newSession,id)` сначала архивирует прежнюю активную, затем пишет новую в `ACTIVE`;
- `write` сохраняет активную или уже существующую paused запись;
- `open(id)` / `current()` вызывают `restore` с точной версией пака;
- `remove(id)` удаляет только выбранную запись.

Нельзя «лечить» несовместимый пак стиранием зависимых сохранений: `PlayroomLibrary.references(game,version)` используется менеджером паков для защиты нужных версий.

## 3. Библиотека паков и формат контейнера

Одна игра доставляется самостоятельным `*.playroom-pack.json`. Установленные версии одной игры могут сосуществовать.

```json
{
  "format": "playroom-pack",
  "formatVersion": 1,
  "manifest": {
    "id": "my-game",
    "name": "Моя игра",
    "version": "0.1.0",
    "engineApi": 1,
    "stateVersion": 1,
    "category": "board",
    "capabilities": {"hands": false},
    "rules": "rules.js",
    "view": "view.js",
    "styles": "styles.css"
  },
  "files": {
    "rules.js": "Код регистрации игры",
    "view.js": "Код регистрации представления",
    "styles.css": "CSS собственной сцены"
  }
}
```

Это **схема упаковки**, не исполняемый валидный игровой пак. Точные поля `id/version/settings/sounds/assets` и лимиты — в [PACK-FORMAT](PACK-FORMAT.md). Обязательные точки входа `rules.js`, `view.js`, `styles.css`; опционально `sounds.js` и ресурсы в `files`. Сжатые/двоичные ассеты встраиваются `data:<mime>;base64,...` по контракту пакета, а пути не могут выходить из пака. До 128 файлов, до 4 MiB для одного JSON и до 20 MiB сериализованной библиотеки паков (реальная quota origin может быть меньше).

Схема подключения:
- `rules.js` вызывает `globalThis.TabletopCore.register({...})` с `id,name,min,max,presets,create,legal,apply` и опционально `bot`/`botReaction`/`project`/`validateState`.
- `view.js` вызывает `PlayroomViews.register(id,renderCombined,renderCover,{surfaces:{table,player}})`.
- `styles.css` ограничен своей сценой; `sounds.js` добавляет каталог звуков игры.
- `manifest.settings` и `capabilities` управляют UI формы запуска; значения попадают в `Room.rules.options` или `Session.options`.

**Не смешивайте версии:** `Session.packVersion` закрепляется при старте. После установки новой версии текущая сохранённая партия продолжает использовать старую версию. Менять уже опубликованное содержимое под прежним `id@version` запрещено.

## 4. Установка и активация пака

`app/pack-manager.js` создаёт `PlayroomPacks = new TabletopPacks({...})` и вызывает `bootstrap(PlayroomInstalledPacks || [])`. После загрузки локальных сохранений `app/app.js` вызывает `PlayroomPackManager.reconcile(packs,library)`, учитывая ссылки сохранённых партий.

`core/packs.js:TabletopPacks`:
1. `parse` проверяет JSON, manifest, размер, пути и содержимое.
2. `prepare` исполняет **доверенный** JS с временной регистрацией правил/view/catalog для проверки. Этот шаг **не является sandbox** для злонамеренных скриптов: код пака выполняется с доступом к браузерному окружению.
3. `install` делает проверку несовместимого содержимого уже известной версии, сохраняет новую библиотеку, регистрирует пакет/представление и активирует его либо оставляет неактивным.
4. `activate(id,version)` переключает точную версию rules/view/CSS/catalog; при обычной ошибке старается откатить регистры.
5. `exportView(id,version)` выдаёт **presentation-only** пакет для клиента (`manifest`, `rules` описания, `sounds`, `view.js`, `styles`, `assets`), **без rules.js, полной Session/seed и закрытого состояния**. Клиенту игры нужен renderer и проекция, не authority rules.
6. `remove(id,version)` не должна удалять версию, на которую ссылаются локальные сохранения; UI запрещает это через `library.references`.

Совместный документ по игровому API: [PACKS.md](PACKS.md); контракт экранов и проекций: [MULTIVIEW.md](MULTIVIEW.md).

## 5. Сеть и профили — отдельный контур

`app/multiplayer.js:ProfileStore` сохраняет публичный `id` и `name`. При `RoomService.connection().dispatch({type:'join'})` хост **всегда** создаёт свежий `Participant.id` независимо от `Profile.id`. Так вкладки с одинаковым публичным профилем не получают автоматически права хоста/друг друга.

После join хост выдаёт новый 64-символьный hex resume token (32 байта криптографической случайности). Клиент `ResumeStore` хранит его под `RESUME_KEY+'.'+roomId`. При повторном соединении с **той же живой комнатой** `dispatch({type:'resume',participantId,resumeToken})` предъявляет этот токен внутри RTC. Хост проверяет, **ротирует** и привязывает старого участника к новому WebRTC. Новый токен сохраняется локально; старый больше не действует. В `RoomService.rooms` и broadcast-тексте секретов нет.

**Это не сохранение хостовой партии.** Если пользователь закроет браузер хоста, временный `RoomService`, `SessionAuthority` и токены в Map пропадут. LAN-01 с полноценной транзакционной записью авторитетного журнала пока только [в плане](PlayRoom_Roadmap_and_Agent_Handoff_2026-10-08.md).

## 6. Форматы на диске / в дистрибутиве

| Артефакт | Кто создаёт | Назначение |
| --- | --- | --- |
| `playroom.html` | `build.py` | Однофайловое приложение без фиксированного набора игр |
| `playroom-all-games.html` | `build.py --all-games --packs-dir ...` | Автономное приложение + закреплённые источники игр |
| `playroom-pwa.zip` и каталог `pwa/` | `build.py --pwa` | Многофайловая PWA для HTTPS-хостинга/Service Worker |
| `playroom-source.zip` | `build.py` | Исходники без личных сохранений/внешних зависимостей паков |
| `tabletop-core.zip` | `build.py` | Отдельное ядро/контракты |
| `SHA256SUMS` | `build.py` | Хеши артефактов |
| `playroom-0.15.0-rc.6.html`, `playroom-pwa-0.15.0-rc.6.zip`, полный bundle | verified release workflow | Immutable RC6 GitHub Pre-release |

`build.py:pwa_runtime_items()` включает `app/*.js`, `app/vendor/*.js`, `app/vendor/LICENSE.*`, `core/*.js`, CSS, icons и генерируемый `installed-packs.js`. `sw.js` кеширует app shell; при новом cache-key удаляет прежние `playroom-pwa-*`. В автономном HTML локальные JS/CSS собраны инлайном; **не требуйте CDN в runtime**. JS-генератор QR и jsQR уже в vendor RC6.

## 7. Перед любым изменением формата

- Определите версию **приложения, пака, `engineApi`, `stateVersion`, `playroom-session.version`, `PlayroomProtocol.version` и `PR3`**: они не взаимозаменяемы.
- Для смены game state обновляйте пакетную `stateVersion`, валидацию `engine.validateState` и тесты старых сохранений.
- Для несовместимого pack API одновременно изменяйте [PACK-FORMAT](PACK-FORMAT.md), [PACKS](PACKS.md) и regression tests; старые паки не переписывать.
- Для сетевого RPC/снимков не писать произвольный `Session.export()` в канал; пользоваться `authority.connect(viewer)`.
- Для новых ключей localStorage предусмотреть отказ quota, private mode, недоступный `content://` origin и сохранение оригинала при ошибке.
- Для релизной сборки после **любого** изменения артефактов повторно пересчитать ZIP и SHA-256; см. [DEVELOPER-WORKFLOW](DEVELOPER-WORKFLOW.md).

## LAN-01 · рабочая ветка, не часть RC6

`app/network-session-store.js` хранит приватную сетевую authority в IndexedDB `playroom.network-host.v1` (`sessions`, `steps`, `receipts`). Состояние, квитанция и revision записываются в одну readwrite-транзакцию **до ACK**. Начальная партия фиксируется до отправки игрового снимка; весь журнал восстанавливается через `Session.restore`. Локальные `playroom.session.v1` и `playroom.paused.v1.*` не мигрируют. Read-only архив в UI проверяет сохранение; **создание активной комнаты/возврат секретов после перезапуска всё ещё не сделаны**. Подробнее: [LAN-01-SESSION-STORE.md](LAN-01-SESSION-STORE.md).
