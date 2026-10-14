# ХОД · настольные игры в браузере

Версия **0.16.2** работает с [коллекцией 0.5.2](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.5.2) из 12 игр. Локальная игра с ботами, передача телефона и сетевая комната через WebRTC доступны в одном приложении. Прежняя стабильная пара 0.16.1 / 0.5.1 остаётся в истории релизов.

## Начать играть

Из [релиза 0.16.2](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.16.2) скачайте:

- `playroom-all-games.html` — автономный HTML со всеми 12 играми;
- `playroom.html` — оболочку для установки выбранных паков;
- `playroom-pwa.zip` — PWA для размещения на HTTPS (или localhost).

Игровые файлы `.playroom-pack.json` доступны в [коллекции 0.5.2](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.5.2). Установка: «Паки игр» → выбрать файл → подтвердить. Пак исполняет код, поэтому устанавливайте только доверенные файлы.

В комнате выберите «Локальная» или «Сетевая», настройте места, ботов и правила. Для сети хост передаёт приглашение, гость возвращает ответ через QR, текст, системное меню «Поделиться» или звук. После сопряжения игра передаётся по WebRTC. Общий Стол и зрители получают публичное представление; игрок — свою руку. Отдельный сервер для локальной сети не нужен.

«Мои партии» содержит локальные и сетевые сохранения и историю. Возврат в меню сохраняет активную комнату; «Остановить и сохранить» завершает текущую игровую встречу, сохраняя партию и лобби. После полного закрытия соединения может понадобиться новое приглашение. Статический HTTPS-сайт не обеспечивает сигнализацию или TURN. Сохранения привязаны к браузеру и origin: не очищайте данные сайта для обновления.

## Разработка и проверка

Python 3.9+, Node.js 22+, npm; браузер подбирается `scripts/codex/browser.cjs`. Репозитории можно разместить рядом под именами `playroom` и `playroom-paks`; для иных путей замените аргумент `--packs-dir`.

```sh
bash scripts/codex/setup.sh --packs-dir ../playroom-paks/packs
bash scripts/codex/check.sh --full --packs-dir ../playroom-paks/packs
bash scripts/codex/serve.sh
```

Сервер: `http://127.0.0.1:4173`. Самостоятельная проверка без игр: `bash scripts/codex/check.sh`. Явный браузер можно передать через `CHROME_BIN`; переносимый выбор описан в [Cloud-инструкции](docs/CODEX-CLOUD.md).

```sh
python3 build.py --all-games --packs-dir ../playroom-paks/packs --pwa --output-dir dist/release-0.16.2
(cd dist/release-0.16.2 && sha256sum -c SHA256SUMS)
```

`core/` — независимый движок, `app/` — оболочка, комнаты и транспорт, правила игр — в отдельном репозитории. `dist/`, установленные для разработки паки, зависимости и приватные архивы не коммитятся.

## Документация

- [Что вошло в 0.16 и ограничения](docs/RELEASE-0.16.md), [Roadmap и приоритеты](docs/ROADMAP.md).
- [Путеводитель по коду](docs/DEVELOPER-INDEX.md), [UI-дизайн](docs/UI-DESIGN-SYSTEM.md).
- [Правила/API паков](docs/PACKS.md), [формат файла](docs/PACK-FORMAT.md), [элементы UI API 2](docs/GAME-ELEMENTS-API.md).
- [Сетевое взаимодействие](docs/DEVELOPER-MULTIPLAYER.md), [сопряжение](docs/DEVELOPER-PAIRING.md).
- [Создание игр](https://github.com/GraphGiraffe/boardgame-playroom-paks/blob/v0.5.2/docs/AUTHORING.md).
- [Проверки](docs/TESTING.md), [выпуск и ZIP для деплоя](docs/RELEASING.md), [CONTRIBUTING](CONTRIBUTING.md), [AGENTS](AGENTS.md).

API движка **1 и 2**, представления **2**, переносимого контейнера **1**. Сохранения требуют точную версию игры; интерфейс старых паков API 1 не поддерживается. Автоматическая миграция сохранений не выполняется.
