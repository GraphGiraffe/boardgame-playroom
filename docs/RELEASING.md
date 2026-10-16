# Выпуск приложения и коллекции

Текущая пара: приложение 0.17.6 и паки 0.6.5. Версии игр независимы. main хранит выпуск, dev — интеграцию. Исторические теги и опубликованные файлы неизменяемы. Для этой пары применяется [раздельный порядок публикации](PACK-PUBLICATION-0.17.md): сначала проверенный каталог паков и production R2 binding, затем выпуск оболочки; после перехода игры могут обновляться без Pages deployment.

## Кандидат 0.18.0-rc.5 / 0.7.0-rc.4

Только prerelease и изолированный канал `0.18-rc.4` для защищённого Pages preview. Выбранные локальные проверки и матрица изменений — [RC5](RC-0.18.0-rc.5.md). Publication workflows получают `checks=none`, поскольку используют уже проверенные immutable файлы; сборка, SHA256 и protected smoke обязательны. Production и автоматические Git builds не переключаются.

## Выпущенная пара 0.17.6 / 0.6.5

Морской бой 0.1.8 снимает подсветку выбранного размера после расстановки и не подсвечивает индикаторы соперника. Приложение 0.17.6 размещает счётчик побед в строке имени карточки Морского боя. Правила и формат состояния пака не менялись; сохранения используют точную версию пака.

Паки прошли [task PR #62](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/62) и [release PR #63](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/63). [GitHub Release `v0.6.5`](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.6.5) закреплён за `f5fbc11925b29a72ad3db7f9edc829c40aa66c5c`; 15 файлов прошли `SHA256SUMS` локально и после скачивания релиза. [Адресная публикация R2 #38671499200](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38671499200) изменила только `battleship`; снимок каталога `075003039fba33e9f3b92641e43a1220d1ea23ce4efcdac812c869d4cae36540` содержит версию 0.1.8.

Приложение прошло [task PR #110](https://github.com/GraphGiraffe/boardgame-playroom/pull/110) и [release PR #111](https://github.com/GraphGiraffe/boardgame-playroom/pull/111). [GitHub Release `v0.17.6`](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.17.6) закреплён за `cca7f60e169619d9cb442ccf3b52d95fefc8dd89`. Локально и в [Actions gate #38671436452](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38671436452) прошёл выбранный `case/rc2-games-browser` — 2/2 с точным SHA паков; отдельная проверка на 390 px подтвердила счётчик в строке имени. Пять файлов приложения прошли `SHA256SUMS` локально и после скачивания.

После [preflight #38671813000](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38671813000) один [production deploy #38671967832](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38671967832) опубликовал deployment `bddc9741-d208-42a8-adf6-ab8e8de655c9` со статусом `published`. Независимый read-only [postflight #38672280218](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38672280218) подтвердил этот deployment на основном адресе `playroom-hod-test.pages.dev` и binding `PLAYROOM_PACKS`.

## Обновление только паков: 0.6.4 для приложения 0.17.5

Морской бой 0.1.7 выделяет выбранный корабль одной рамкой. [Task PR #60](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/60), [release PR #61](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/61) и [релиз 0.6.4](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.6.4) закреплены за `a27171977f93e206ed5abc76248a9e2a12cd5ade`. Проверены синтаксис, сборка, 15 контрольных сумм локально и после скачивания релиза, а также единый контур для двух ориентаций корабля. Адресная [публикация R2 #38668713138](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38668713138) изменила только `battleship`; снимок каталога: `96b520b3671eb6a42a7e7b494e111a86159745bc29efe29e21f2fbddad5c7a42`. Приложение и Pages deployment остались версии 0.17.5.

## Выпущенная пара 0.17.5 / 0.6.3

Лудо 0.1.12 выделяет фишки кругом. Морской бой 0.1.6 сохраняет ручной выбор поля между ходами, даёт зрителю автопоказ, держит результат выстрела минимум 750 мс и исправляет перетаскивание кораблей. Формат состояния игр не менялся; сохранения привязаны к точной версии пака.

Паки прошли [task PR #56](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/56) и [release PR #57](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/57). [GitHub Release `v0.6.3`](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.6.3) закреплён за `3da95e68057f68e3e052663fe71cf16d92510701`. Все 15 скачанных файлов прошли `SHA256SUMS`. Адресные публикации R2 [Лудо #38661734775](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38661734775) и [Морского боя #38661893354](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38661893354) изменили только указанный пак каждая; итоговый снимок каталога `4475de4172e51e838bc015b28e081a2798c09147f533c12b80abbce601b64293` содержит версии 0.1.12 / 0.1.6.

Приложение прошло [task PR #104](https://github.com/GraphGiraffe/boardgame-playroom/pull/104) и [release PR #105](https://github.com/GraphGiraffe/boardgame-playroom/pull/105). [GitHub Release `v0.17.5`](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.17.5) закреплён за `1aedea74bebf2caade1447b26f04cc516b3c6dba`. Локально и в [Actions gate #38662059672](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38662059672) прошли только явно выбранные `case/game-flow,case/rc2-games,case/rc2-games-browser,case/ludo-team-markers-browser,case/uno-drag` — 42/42 с точным SHA паков; пять скачанных файлов релиза прошли `SHA256SUMS`.

После [preflight #38662683804](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38662683804) один [production deploy #38662908337](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38662908337) опубликовал deployment `0735cbc3-3347-4fc8-8e49-2982a00bdb50` со статусом `published`. Независимый read-only [postflight #38666962478](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38666962478) подтвердил этот deployment на основном адресе `playroom-hod-test.pages.dev`, binding `PLAYROOM_PACKS` и отключённые автоматические Git-деплои.

## Выпущенная пара 0.17.4 / 0.6.2

Паки прошли [task PR #52](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/52) и [release PR #53](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/53). [Тег и GitHub Release `v0.6.2`](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.6.2) закреплены за `fddf0da96e711b6444d64b3b79028e3db03734c9`. В 16 файлах релиза — 12 паков, архив коллекции, исходники, отдельный архив общих ассетов и `SHA256SUMS`; скачанные файлы сверены. [Публикация R2 #38625024423](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38625024423) завершилась успешно.

Приложение прошло [task PR #98](https://github.com/GraphGiraffe/boardgame-playroom/pull/98) и [release PR #99](https://github.com/GraphGiraffe/boardgame-playroom/pull/99). [Тег и GitHub Release `v0.17.4`](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.17.4) закреплены за `99f26ad84083bd8ed1f1d1a988d3f3fb9e2935f3`. Локальный и [Actions gate #38625519821](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38625519821) прошли 811/811 с точным SHA паков. Пять скачанных файлов приложения совпали с `SHA256SUMS`.

[Preflight #38634942612](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38634942612) подтвердил существующий защищённый Pages проект и R2 binding. Единственная загрузка [#38635249654](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38635249654) создала production deployment `28fa8189-5ab2-43e6-8294-1a48b84c535d`, но ранний smoke попал в окно распространения Pages и вернул прежний сайт. Read-only [проверка нового deployment #38636238612](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38636238612) прошла; [переключение #38636924897](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38636924897) выбрало уже загруженный deployment без второй загрузки. Независимый [postflight #38637401367](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38637401367) подтвердил его на основном адресе, защищённый runtime, каталог 12 паков и offline PWA. Автоматические Git production/preview сборки выключены.

## Выпущенная пара 0.17.3 / 0.6.1

Приложение читает командные цвета Лудо из метаданных установленного пака и показывает один и тот же уменьшенный жетон-диск в лобби и игре. Пустой командный диск не имеет центральной точки. Пак Лудо 0.1.10 рисует безопасную звезду SVG почти на всю клетку по центру, стартовые стрелки как SVG-треугольники и фишки базы по центрам кругов; остальные паки не меняются. Для совместного выпуска выбраны адресные сценарии `case/ludo-team-markers-browser`, `case/first-medallion-browser` и необходимые проверки сборки/контрольных сумм. Локально оба браузерных сценария прошли, включая ширину 320 px.

Изменения прошли task PR [паков #48](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/48) и [приложения #92](https://github.com/GraphGiraffe/boardgame-playroom/pull/92), затем release PR [#49](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/49) и [#93](https://github.com/GraphGiraffe/boardgame-playroom/pull/93). Теги [паков `v0.6.1`](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.6.1) и [приложения `v0.17.3`](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.17.3) указывают на `b66bf04ec0e1d63d8d7541b0319b1cb5a60492ad` и `05baaa963fc0ae01d23fed2082b42b90cb623d5b`. Все 14 файлов паков и пять файлов приложения скачаны из GitHub Releases и сверены с `SHA256SUMS`.

Ручная [сборка кандидата #38570616681](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38570616681) использовала точный SHA паков и выполнила только выбранные два браузерных сценария, 2/2. Публикация [паков #38570573996](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38570573996) обновила в R2 только Лудо до 0.1.10; снимок каталога `5b1e1efc75a64bd45fb7e38fc4e4f7ac614a59dfeeda6a37dd2ddd1e9671b88e`. Preflight [#38571247760](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38571247760) прошёл перед единственным production [деплоем #38571458043](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38571458043) в существующий Pages проект. Deployment `e4447f0e-09f5-416a-a955-13312a13a502` проверен независимым [postflight #38571888730](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38571888730) на основном адресе: защищённый runtime, 12 файлов каталога и офлайн PWA прошли smoke; автоматические Git-деплои production/preview выключены.

## Выпущенная пара 0.17.2 / 0.6.0

Исправлена форма жетона первого игрока: у контурной единицы появился отдельный светло-бежевый диск и центрирование. Коллекция паков 0.6.0 не менялась. Изменение прошло [task PR #88](https://github.com/GraphGiraffe/boardgame-playroom/pull/88) и [release PR #89](https://github.com/GraphGiraffe/boardgame-playroom/pull/89). Тег приложения `v0.17.2` указывает на `a8185c0e17552f119657e6c57a08a06c4ea5fe6d`.

Адресный браузерный тест лобби и игровой карточки прошёл локально на 390 px, включая проверку отсутствия переполнения на 320 px. Ручной [RC workflow #38566731780](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38566731780) выполнил только `checks=case/first-medallion-browser`: 1/1, затем сборку с закреплённым SHA паков `06d270798c82e9b0d3e6a09835d0c872f4a083cc` и сверку пяти SHA256. Полный прогон не запускался: правила игр, паки, сеть и сохранения не менялись. Все пять скачанных файлов [GitHub Release](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.17.2) повторно прошли `SHA256SUMS`.

Один production [deploy #38567481376](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38567481376) опубликовал deployment `35f73a51-cee1-4f50-a3e8-77704e2eeae7` на `playroom-hod-test.pages.dev`. Независимый read-only [preflight #38568040590](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38568040590) подтвердил этот deployment, R2 bucket `playroom-hod-packs` и отключённые автоматические Git-сборки production/preview.

## Выпущенная пара 0.17.1 / 0.6.0

Исправление счётчика главного меню: обычный вид показывает количество видимых и скрытых игр, фильтры — число подходящих игр, режим редактирования — общее количество. Коллекция паков 0.6.0 не изменяется.

Тег приложения `v0.17.1` указывает на `f9b710bdece5232176d84fcb6939247f2653a7aa`; GitHub Release содержит пять публичных файлов и `SHA256SUMS`. Адресный браузерный сценарий меню прошёл, локальный совместный прогон перед выпуском — 804/804; контрольные суммы пяти скачанных файлов совпали. Production Pages deployment `63200bbe-40b2-453f-9d66-07ab4e85f1ca` опубликован запуском [#38564956050](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38564956050). Независимый read-only [preflight #38565407589](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38565407589) подтвердил основной адрес, точный deployment и R2 bucket; автоматические Git-сборки production/preview выключены. Коллекция `v0.6.0` осталась прежней.

В ручном `Release candidate build` поле `checks` обязательно, без значения по умолчанию. Укажите `checks=none` для осознанного пропуска продуктовых тестов либо необходимые блоки, подблоки и сценарии через запятую, например `checks=case/rc2-hub-browser`. Чтобы выполнить все блоки, укажите `checks=core,input,games,ui,storage,network,pairing`; `full` и `all` здесь не принимаются. Выбор и причину записывайте в выпускных сведениях; сборка с закреплённым SHA паков и проверка `SHA256SUMS` выполняются при любом режиме. Pages при публикации всегда запускает защищённый smoke.

## Выпущенная пара 0.17.0 / 0.6.0

Тег паков `v0.6.0` указывает на `06d270798c82e9b0d3e6a09835d0c872f4a083cc`; GitHub Release содержит 12 JSON-паков, два ZIP и `SHA256SUMS`. Все 14 сумм скачанных файлов совпали. Публикация R2 [#38549892637](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38549892637) записала снимок каталога `0ced80beb279bd48b877391c3b5b7d7d301748a288712591e334bef15cfbfddd` после обратной проверки файлов.

Тег приложения `v0.17.0` указывает на `0f4c7413ffc905df569708096949466107d0ea6f`. Совместный локальный gate прошёл 804/804 без пропусков; окончательный Actions build [#38552512412](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38552512412) прошёл на эквивалентном дереве `dev` с закреплённым SHA паков. Выпускной `main` имеет то же Git-дерево; пять публичных файлов локальной сборки побайтно совпали с Actions-артефактом и скачанным GitHub Release по `SHA256SUMS`.

Единственная загрузка Pages [#38559814340](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38559814340) создала защищённый deployment `cef1a781-79b4-4a6a-8b7b-bbd82bffcf0a`; ранний smoke попал в окно распространения Pages и Action восстановил прежний сайт. Read-only smoke [#38560342485](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38560342485) проверил новый deployment. Переключение на уже загруженный deployment [#38560549504](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38560549504) успело обновить canonical deployment, но проверка основного адреса увидела старый Service Worker до окончания распространения. Последующий read-only preflight [#38561113195](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38561113195) подтвердил основной адрес, защищённый каталог и 12 паков, offline, binding `PLAYROOM_PACKS` → `playroom-hod-packs` и указанный production deployment. Автоматические Git production и preview сборки выключены; записи `idle` в списке Pages не содержат развёрнутого сайта.

Ручная проверка обновления заранее открытой вкладки и установленной PWA, а также отдельный последующий выпуск одного пака остаются приёмочными сценариями будущего изменения паков; текущий выпуск не создавал фиктивную новую версию пака ради этого теста.

## Выпущенная пара 0.16.3 / 0.5.4

Паки прошли task PR #37 и release PR #38; тег `v0.5.4` указывает на `06c04932a342c0645e469fe119f668295d4b0167`. Приложение прошло task PR #72 и release PR #73; тег `v0.16.3` указывает на `65db72a5cf865c2ef10a8fa3a31bbb46a28897b8` и закрепляет SHA паков. Полный совместный gate завершился 801/801 без пропусков. Оба GitHub Releases опубликованы; скачанные assets прошли SHA256SUMS (14 файлов паков и 5 файлов приложения).

Один production upload через `pages-deploy.yml` (#38510221088) создал защищённый deployment `b13a537f-b709-4b1c-b94b-7dd12a3204b1`, но smoke сразу после загрузки завис на проверке неверного пароля, поэтому Action вернул прежний deployment `901bccd2-d3d2-452e-967a-0fb1012636cc`. Read-only preflight #38510684263 подтвердил полный защищённый smoke нового deployment после распространения Pages. Action #38510820904 переключил основной адрес на этот **уже загруженный** deployment без повторной загрузки и подтвердил защищённые ресурсы и offline на обоих адресах. Живая заранее открытая вкладка и установленная PWA не были доступны для ручной проверки обновления; автоматический сценарий Service Worker вошёл в совместный gate.

## Выпущенная пара 0.16.2 / 0.5.2

Паки прошли task PR #31 и release PR #32; тег `v0.5.2` указывает на `a9797c5`. Приложение прошло task PR #68 и release PR #69; тег `v0.16.2` указывает на `08e2faf` и закрепляет точный SHA паков. Полный совместный gate завершился 800/800 без пропусков. Оба GitHub Releases опубликованы, скачанные assets прошли SHA256SUMS. Один production запуск `pages-deploy.yml` (#38495991868) завершился статусом `published` в проекте `playroom-hod-test`, deployment `901bccd2-d3d2-452e-967a-0fb1012636cc`; защищённые ресурсы и offline прошли smoke на основном адресе. Живую заранее открытую вкладку 0.16.1 проверить не удалось: доступного окна браузера не было; автоматический сценарий ожидающего Service Worker прошёл в совместном gate.

## Выпущенная пара 0.16.1 / 0.5.1

После полного локального совместного gate (799/799) паки прошли task PR #27 и release PR #28; тег `v0.5.1` указывает на `d526995`. Приложение прошло task PR #64 и release PR #65; тег `v0.16.1` указывает на `0c3df50`. Оба GitHub Releases опубликованы, скачанные assets прошли SHA256SUMS. Один production запуск `pages-deploy.yml` (#38422098383) завершился статусом `published` в проекте `playroom-hod-test`; read-only preflight #38428201682 подтвердил основной адрес и deployment `c6a9a0bd-b0f6-4d7a-a125-d582dc4c18e9`. Прежние вкладки 0.16.0 могут требовать однократной проверки Service Worker; данные сайта очищать нельзя.

## Выпуск 0.16.0 / 0.5.0

После локального совместного gate объединить task PR в `dev`. Сначала провести release PR паков `dev → main` merge-коммитом, fast-forward `dev`, создать `v0.5.0` и стабильный GitHub Release с файлами `dist/release-0.5.0`. Закрепить окончательный main SHA паков в workflow приложения, выполнить окончательный совместный gate для этой пары, затем провести такой же release PR приложения, fast-forward `dev`, создать `v0.16.0` и стабильный GitHub Release. Скачать опубликованные assets обоих релизов и проверить SHA256SUMS. Исторические версии паков не переписывать.

Публикация Pages — один ручной запуск `Protected Pages publication` на `main` с `operation=deploy`, `release=v0.16.0` после проверки GitHub Release. Использовать прежний проект и приватную обёртку; workflow создаёт отчёт и выполняет rollback при ошибке smoke. Preview не требуется. При недоступном Actions использовать проверенный публичный ZIP и `scripts/deploy-local.sh` из закрытого комплекта в том же Pages проекте; не загружать публичный ZIP вместо защищённого runtime.

## Подготовка

1. Проверить чистоту рабочих деревьев, уникальные изменения веток и PR. Влить готовые исправления в dev обычными task PR. Сохранить полезные сведения старых планов в действующей документации.
2. На release-ветках обновить package.json/package-lock.json/sw.js приложения, VERSION коллекции в build.py, README/CHANGELOG и release notes. Не переписывать индивидуальные паки ради версии коллекции.
3. Сверить API, Roadmap, ограничения, инструкции и ссылки. Удалять устаревшие документы после переноса действующих требований; прошлое остаётся в Git/тегах.
4. Явно выбрать проверки по фактическим изменениям: `checks=none`, необходимые селекторы либо все семь блоков полным списком `core,input,games,ui,storage,network,pairing`. Отсутствие выбора не запускает релизную сборку. Зафиксировать выбор и причину; собрать файлы и сверить `SHA256SUMS`. По текущему workflow обычный push и PR не запускают Actions; ручной release-run выполняется на окончательном SHA.
5. Подготовку объединить в dev. Выпуск провести отдельными PR dev → main, merge-коммитом; затем fast-forward dev до main. Зафиксировать main SHA паков в совместных workflow приложения перед окончательной проверкой приложения.

## Сборка из окончательных main SHA

При соседних каталогах playroom и playroom-paks:

```sh
# В репозитории паков
python3 build.py --output-dir dist/release-0.5.0
(cd dist/release-0.5.0 && sha256sum -c SHA256SUMS)
# В репозитории приложения
python3 build.py --all-games --packs-dir ../playroom-paks/packs --pwa --output-dir dist/release-0.16.0
(cd dist/release-0.16.0 && sha256sum -c SHA256SUMS)
```

Публичные assets приложения: playroom.html, playroom-all-games.html, playroom-pwa.zip, playroom-source.zip, tabletop-core.zip, SHA256SUMS. Коллекция 0.5.0: двенадцать versioned .playroom-pack.json, playroom-paks-0.5.0.zip, playroom-paks-source.zip, SHA256SUMS. Дополнительный provenance JSON фиксирует оба commit SHA, версии и выполненные проверки; при его добавлении пересчитать SHA256SUMS.

Теги v0.16.0 и v0.5.0 должны указывать на проверенные main SHA. Создать GitHub Releases с prerelease=false, заметками и assets. Сначала можно загрузить draft и проверить все файлы, затем опубликовать. Не перемещать существующие теги и не заменять файлы выпущенной версии.

Скачать assets через GitHub Release и выполнить sha256sum -c SHA256SUMS над скачанными байтами. Проверить имя/тег/target SHA/prerelease flag. Слияние PR или зелёный build сами по себе не являются публикацией.

## Кеш и состав PWA

Сборка PWA содержит по одному экземпляру подключаемых JS/CSS: только имя с хешем содержимого. HTML и precache Service Worker ссылаются на эти имена; исходные имена остаются в исходниках, а не в деплойном архиве. Повторная сборка в тот же каталог удаляет устаревшие JS/CSS сборки.

Имя кеша включает версию и отпечаток всей сборки. Даже перепаковка одной версии не перезаписывает кеш работающей партии. Worker сначала загружает и проверяет весь shell по SHA256, затем показывает постоянную кнопку «Обновить». Перед активацией все открытые окна подтверждают, что они находятся в меню без активной комнаты; занятое или неответившее окно блокирует обновление. При успешной активации окна перезагружаются, прежние кеши playroom-pwa- удаляются, сохранения IndexedDB остаются. Ошибочный, устаревший или подменённый страницей входа ресурс не принимается.

## Закрытый архив для Pages

Публичный PWA ZIP не содержит контроля доступа. Для существующего защищённого проекта используется отдельная упаковка:

```sh
python3 scripts/package-pages.py \
  --public dist/release-0.16.0/playroom-pwa.zip \
  --protected-base /path/to/previous-private-pages.zip \
  --output /path/to/private/playroom-pages-0.16.0-protected.zip
```

Скрипт сохраняет _worker.js, _routes.json и manifest.webmanifest из доверенной прежней обёртки и проверяет байты архива. Не печатать Worker/секреты и не загружать этот ZIP в публичный Release. Корень ZIP содержит index.html без дополнительного каталога. Сверить runtime с публичной сборкой, затем запустить существующие браузерные сценарии над извлечённым runtime. Локальная проверка static runtime не является проверкой авторизации живого Cloudflare.

Публикация сайта выполняется отдельно на том же origin, чтобы не потерять доступ к сохранениям. Автоматизация описана в [DEPLOY-01](CLOUDFLARE-PAGES-DEPLOY-PLAN.md) реализована для кандидата 0.16; живую публикацию подтверждает успешный workflow, а не наличие скрипта.

## Завершение

Сохранить локальную резервную Git bundle всех refs перед очисткой. После успешной публикации закрыть устаревшие PR, удалить завершённые worktree и task/release ветки локально и на origin. Оставить main/dev, теги и историю PR. Не удалять неперенесённую уникальную работу. Сообщить ссылки на оба релиза, приватный архив, SHA256 и фактические проверки.

## История кандидата 0.16

Перед стабильным выпуском выполнить [приёмку 0.16](RELEASE-0.16.md). Собирать RC из проверенного SHA с версией 0.16.0-rc.4 и публиковать как prerelease; не заменять стабильную 0.15 до приёмки. Workflow запускается вручную на `dev` через GitHub CLI; Ready PR не запускает дополнительные Actions.

Для кандидата использовать `python3 build.py --all-games --packs-dir ../playroom-paks/packs --pwa --output-dir dist/release-0.16.0-rc.4`, затем проверить `SHA256SUMS` в этом каталоге. Закрытый архив собирать из его `playroom-pwa.zip` командой `scripts/package-pages.py`, с прежней доверенной приватной обёрткой и именем `playroom-pages-0.16.0-rc.4-protected.zip`. Для rc.4 выпустить новую коллекцию 0.5.0-preview.3 из двенадцати паков и закрепить её точный SHA в workflow приложения. Примеры стабильной 0.15 выше описывают уже опубликованную базу; новые RC не заменяют её assets.

До переноса нового Pages workflow на default branch используйте существующий **Release candidate build**: выберите ветку кандидата и operation `preflight`, `deploy` или `rollback`. Он вызывает тот же Pages workflow с того же SHA через workflow_call; `build` по-прежнему выполняет полную сборку RC. Автоматической публикации по push нет.

### Проверка отдельного защищённого preview

`gh workflow run prerelease.yml --ref dev -f operation=preview -f release=v0.16.0-rc.4` проверяет архив опубликованного RC, приватную обёртку, вход, ресурсы и offline на отдельном deployment. Эта операция не переключает production и не отключает Git builds. `deploy` требует рабочую защищённую точку отката и публикует сразу production; промежуточный preview не создаётся.

### Ручной запуск RC.4 без потери GitHub-интеграции

Предпочтительно: Actions → Release candidate build → Run workflow → ветка dev → operation=deploy → release=v0.16.0-rc.4. Не используйте build повторно, если точная пара SHA уже проверена и artifacts готовы. Production обновляется в существующем проекте, origin и интеграция GitHub сохраняются.

Если Actions недоступен, распакуйте подготовленный приватный архив и используйте скрипт комплекта deploy-local.sh (он проверяет SHA и release-info). Низкоуровневая команда, когда архив уже проверен и обёртка на месте:

```sh
npx wrangler pages deploy /path/to/verified-runtime --project-name playroom-hod-test --branch main --commit-hash APP_SHA
```

Токен/аккаунт задаются через окружение. Не загружайте публичный PWA ZIP поверх защищённого сайта без прежней приватной обёртки. Веб drag-and-drop загрузка недоступна в Git-integrated Pages проекте; прямой deploy через Wrangler сохраняет интеграцию. Финальный результат подтверждает проверка origin/release-info и отчёт deploy-report.json.

## 0.18 RC: без изменения стабильного сайта

Кандидат выпускается из проверенной dev пары отдельными prerelease tags приложения/коллекции. Main и production остаются стабильными. Порядок: выбранные тесты → сборки/SHA → PR в dev → immutable artifacts/releases → packs-publish с channel=0.18-rc.1 → prerelease gateway operation=preview, pack_channel=0.18-rc.1. Для публикации уже проверенных assets явно указывается checks=none; проверка байтов/защиты/offline обязательна. Автоматические Git builds сохраняются выключенными.

Preview запускает production smoke до/после и сравнивает версии/каталог/hash, помимо canonical deployment. Паковые prerelease нельзя публиковать в пустой production channel. Точные свидетельства — [отчёт 0.18 RC](RC-0.18.0-rc.1.md). Старые команды preview в исторических разделах ниже/выше требуют дополнить обязательным checks=none и отдельным RC channel; отсутствие выбора не запускает публикацию.

### 0.18-rc.1 опубликован в отдельное preview, 2026-10-16

Приложение [v0.18.0-rc.1](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0-rc.1) / коллекция [v0.7.0-rc.1](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.0-rc.1). **[Проверенное preview](https://51c9a867.playroom-hod-test.pages.dev)**, [Action #38846469923](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38846469923): preview-verified, protection/runtime/catalog 12 hashes/offline прошли, production before/after совпал и canonical не переключён. Стабильная пара остаётся 0.17.6 / 0.6.5. Полная пара SHA, checks и сведения об исправлении deploy tooling — [отчёт RC](RC-0.18.0-rc.1.md).

### 0.18-rc.2: исправления пользовательской приёмки

Приложение 0.18.0-rc.2 / коллекция 0.7.0-rc.2 опубликованы prerelease и в [изолированное preview](https://c68c76a1.playroom-hod-test.pages.dev). Проверены source SHA, release SHA256, защищённые runtime bytes, 12 R2 файлов и offline; production сохранил 0.17.6 / 0.6.5. Проверки выбраны адресно, публикации checks=none. [Матрица замечаний и доказательства](RC-0.18.0-rc.2.md).

### Повторная проверка уже загруженного preview

Через `prerelease.yml` передать `operation=preflight`, `checks=none`, точные `release`, `deployment` и непустой `pack_channel`. В отличие от preflight без канала, этот путь требует успешный preview deployment, сверяет его commit с immutable release, проверяет артефакт и полный protected/offline runtime, сравнивает production до/после. Не вызывает upload или provider mutations. Итоговый отчёт: `status=preview-verified`, `uploaded=false`, `productionUnchanged=true`. Применять при неудачной проверке после upload; опубликованный runtime не переписывается.

Последняя подтверждённая пара кандидата — app 0.18.0-rc.5 / collection 0.7.0-rc.4, [preview](https://cc0f5728.playroom-hod-test.pages.dev); источник и полная проверка — [HANDOFF](HANDOFF-0.18.md#итог-подтверждённый-rc5-preview). Production неизменен.
