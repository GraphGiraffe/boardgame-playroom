# Разработка и проверка 0.15

[Индекс](DEVELOPER-INDEX.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [TESTING](TESTING.md) · [релиз](RELEASING.md)

1. Проверить корень Git, текущий HEAD и изменения; для новой задачи использовать ветку от dev. Не сбрасывать чужую работу.
2. Подготовить окружение через scripts/codex/setup.sh. Для совместной проверки указать каталог packs companion checkout. scripts/codex/browser.cjs выбирает браузер переносимо; CHROME_BIN задаёт явный путь.
3. Выполнить профильные существующие тесты; при изменении UI/сети/сохранений/API и перед релизом — полный check.sh --full --packs-dir PATH. Самостоятельная проверка не заменяет игры.
4. Обновить действующие документы, API и Roadmap, если меняется контракт/статус. Не добавлять новый RC-handoff как альтернативный источник истины.
5. Подготовить Draft PR в dev; Ready запускает CI один раз. После исправлений проверять именно новый SHA, запускать workflow вручную при необходимости. Обычный push не является триггером проверок.
6. Обычный task PR объединяется squash. Stable выпускается отдельным dev → main merge PR; затем dev fast-forward до main. Без force reset.

Application checks выполняет самостоятельные проверки. Multiplayer preview smoke проверяет совместимость с закреплённым SHA паков. Pinned app and packs integration принимает полный packs_ref и выполняет полный прогон. Release candidate build — ручная проверочная сборка, не публикация GitHub Release. source-artifact создаёт архив исходников. Устаревшие одноразовые RC publishers удалены; стабильная публикация выполняется по RELEASING.

Собирать release из точного main SHA после проверки, а не из произвольной рабочей ветки. Приватный Worker и protected ZIP не являются публичными assets. Факт публикации проверять через release record и скачанные SHA256SUMS.
