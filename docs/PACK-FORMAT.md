# Контейнер пака · формат 1 / API 4

Область применения: приложение **0.21.0** и коллекция **0.8.10**, engineApi 4 / viewApi 3 / protocol 3. Исторические этапы ниже поясняют совместимость; текущая приёмка хранится в [utils](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/reports/ACCEPTANCE-0.21.0.md).

`.playroom-pack.json` — UTF-8 JSON с format=playroom-pack, formatVersion=1, manifest и files. Это автономная поставка одной игры. ZIP коллекции содержит такие JSON и общие ассеты; импорт игры принимает отдельный JSON.

Manifest: id, SemVer version, name, engineApi=4, viewApi=3, положительный stateVersion, rules/view/styles entrypoints, capabilities, playModes, settings и ресурсы. ID начинается со строчной латинской буквы, далее буквы/цифры/_/-, до 64 символов. Лимиты и допустимые пути определяет канонический `playroom-paks/shared/pack_compiler.py`; runtime validator — core/packs.js. Вход не исполняется до структурной проверки, затем устанавливается только доверенный код.

Исходный `sourceModules` перечисляет rules/view-модули и locale JSON. `sharedDomain`, `sharedUi`, `sharedAssets`, `sharedAssetPacks` добавляют зависимости при сборке. Порядок модулей значим. Сборщик включает зависимости, объединяет locale catalogs, удаляет source-only декларации из поставляемого manifest и проверяет контейнер. Generated manifest.js создаётся из manifest.json, не редактируется вручную.

```json
{"sourceModules":{"rules":["domain/game.js","presentation/scene.js"],"view":["presentation/scene.js"],"locales":{"ru":["locales/ru/game.json"]}}}
```

Рабочие примеры: tictactoe и yatzy в коллекции. Игра регистрирует чистое Definition через SDK model-registration; Web renderer регистрируется отдельно. Скрипты не берутся с CDN, ресурсы поставляются локально. JS-строки изображений должны использовать встроенные/разрешённые asset URI; CSS URL собирает compiler.

Версия опубликованного пака неизменна. Любые новые bytes требуют новой packVersion; stateVersion изменяется при изменении формы состояния, engineApi — при контракте SDK. Коллекция имеет независимую версию. Сохранения/история требуют точную packVersion. Удаление используемой версии блокируется библиотекой. Переход API описан в [данных](DEVELOPER-DATA.md).

Общие asset packs имеют format=playroom-asset-pack, formatVersion=1, id/version, files и при необходимости scripts/styles/dependencies. Канонические примеры — characters, cartoon-deck, mini-cards. Скин не меняет игровые ID, ранги/масти, RNG или hidden-границу.
