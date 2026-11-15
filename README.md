# ХОД

Настольные игры в браузере: на одном устройстве, с ботами, по локальной сети и онлайн. Приложение можно установить как PWA; игры распространяются отдельной коллекцией.

## Использование

- [Сайт](https://graphgiraffe.github.io/playroom-hod-test/) и [готовые сборки](https://github.com/GraphGiraffe/boardgame-playroom/releases).
- `playroom-all-games.html` — автономный файл с играми; `playroom.html` — оболочка для отдельных паков.
- «Рядом» соединяет устройства в локальной сети через WebRTC; данными подключения можно обменяться QR, текстом или звуком.
- «Онлайн» использует аккаунты, комнаты и приглашения; игровой обмен идёт по WebRTC.
- «Мои партии» хранит партии и историю. Обновление сохраняет пользовательские данные и точные версии зависимостей старых партий.
- В настройках есть обратная связь с техническими сведениями, сжатым логом и скриншотами.

Устанавливайте паки только из доверенных источников: они содержат исполняемый код. Не очищайте данные сайта ради обновления; для переноса между браузерами используйте экспорт.

## Разработка

Рядом разместите репозиторий `playroom-paks`. Подготовка и локальная сборка:

```sh
bash scripts/codex/setup.sh --packs-dir ../playroom-paks/packs
python3 build.py --all-games --pwa --packs-dir ../playroom-paks/packs --output-dir dist/local
bash scripts/codex/serve.sh
```

Требования, выбор проверок и правила веток: [CONTRIBUTING](CONTRIBUTING.md), [руководство тестирования](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/TESTING.md). Полный набор проверок не запускается автоматически.

## Документация

[Индекс разработчика](docs/DEVELOPER-INDEX.md) · [архитектура](docs/DEVELOPER-ARCHITECTURE.md) · [хранение данных](docs/LOCAL-STORAGE.md) · [механики](docs/MECHANICS.md) · [коллекция игр](https://github.com/GraphGiraffe/boardgame-playroom-paks) · [инструменты и roadmap](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/PROJECT.md).

История изменений: [CHANGELOG](CHANGELOG.md). Условия использования и исключения: [LICENSING](LICENSING.md), [LICENSE](LICENSE).
