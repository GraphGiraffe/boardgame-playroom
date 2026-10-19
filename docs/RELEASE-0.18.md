# Выпуск 0.18.2 / 0.7.1

Пара: приложение **0.18.2**, существующая коллекция **0.7.1**, engineApi 3 / viewApi 2 / protocol 2. Факт публикации подтверждается записью GitHub Release, скачанными SHA256/ZIP и production report; версия исходников сама по себе не означает обновление сайта.

- [Приложение и SDK](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.2).
- [Коллекция без переиздания](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.1).
- [Сайт](https://playroom-hod-test.pages.dev).
- [Состав патча и проверки](PATCH-0.18.2.md).

## Изменения и проверки

Три группы фильтров библиотеки скрыты по умолчанию; кнопка с SVG-воронкой находится после «Все» и «Избранное». Сворачивание сохраняет выбранные значения и результаты. После перезагрузки группы снова скрыты.

Целевой source gate: `node scripts/codex/test.cjs case/library-filters-browser,case/rc2-hub-browser` — 5/5; 320/390 portrait, 740×390 landscape и desktop 1280×800. Проверены focus, Enter/Space, aria-expanded, переполнение, сохранение фильтра при переключении «Все»/«Избранное» и прежний сценарий избранного/порядка игр. Скриншоты проверены визуально. Полный игровой/сетевой набор не запускается для этого адресного UI-патча. SHA256/ZIP и protected runtime/catalog/offline проверяются при выпуске и deploy.

Источники и точная companion pair записываются в README-TEST.txt и SOURCE-PROVENANCE.json. Сборка выполняется из окончательного main SHA, коллекция — ae2e030cf3f709b0388fc846de4c699b2c15c3bc. Workflow использует опубликованный PWA ZIP; приватные worker/routes и секреты не включаются в public assets. Существующие Pages project, защита и R2 binding сохраняются.

Правила, RNG, privacy, stateVersion и pack versions не меняются. Старые exact-version паки, сохранения, теги и bytes остаются неизменными. Предыдущая стабильная оболочка и точка отката: [app 0.18.1](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.1), deployment `06249d72-c1f9-4102-93f6-44c06dd33dde`; catalog 0.7.1 `3fa93bbceeb20c55d3a1bc4bafc4d1accfa57924c59efe102d388edfda166734`.

Предыдущий патч настроек описан в [PATCH-0.18.1](PATCH-0.18.1.md); новые игры/скины остаются спецификацией. Процедура — [RELEASING](RELEASING.md).
