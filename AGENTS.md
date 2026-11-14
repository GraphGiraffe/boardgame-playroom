# Работа с ХОД

Текущие контракты: engineApi 4, viewApi 3, protocol 3. Начните с [индекса](docs/DEVELOPER-INDEX.md), [архитектуры](docs/DEVELOPER-ARCHITECTURE.md), [механик](docs/MECHANICS.md) и [Roadmap](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/ROADMAP.md). Актуальный stable и публикацию проверять по release evidence в canonical utils и опубликованным артефактам; версия исходников или preview не доказывает stable-публикацию.

- Проверьте root/status/ветку и live-состояние. Соседние проекты и чужие изменения сохранять.
- domain игр принадлежит отдельной коллекции; application принимает порты, platform/web реализует их. Общие компоненты не узнают game ID.
- Только API 4, без legacy runtime; старые данные сохранять для экспорта, опубликованные версии не переписывать.
- Authority у хоста; сеть получает проекции, не Session.export. ACK после durable commit; commandId не создаёт второй ход. Resume-token не входит в QR/snapshot/логи.
- Fixed scene по умолчанию. Динамическая геометрия только opt-in конкретного действия; не всего пака. Публичность проверяется до renderer/эффектов.
- Канонические shared assets/compiler в коллекции; generated host copies обновлять явной companion сборкой, не руками.
- Не коммитить dist, generated installed packs, секреты, личные данные/private Worker/ZIP.

## Проверки

Следовать [локальному порядку проверок и бюджету Actions/RC](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/VALIDATION-POLICY.md). Выбирать минимальные blocks/subblocks/case по затронутому поведению, смотреть `--list`, выполнять локально с точным companion. Полный набор не запускать автоматически для выпуска. Успешные проверки не повторять без изменения проверенных исходников; после исправления повторять затронутые сценарии. Документация не требует продуктовых тестов/Actions.

Для публикации `checks=none`; обязательные Build/SHA/ZIP и protected runtime/catalog/offline verification сохраняются. Удалённые source tests — только выбранные и при обоснованной необходимости. Один локально проверенный кандидат по умолчанию; не создавать новый RC/прогон для каждого merge.

## Ветки

Task branch → Draft PR → dev squash. Stable: dev → main merge commit, затем fast-forward dev без force. Проверки/Actions вручную, push/Ready их не запускает. [CONTRIBUTING](CONTRIBUTING.md), [RELEASING](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/RELEASING.md). Очистка только по доказанному включению изменений, с backup и сохранением уникальных работ.

## Предотвращение повторных регрессий

Перед изменением упаковки, скинов, жестов или сохранений прочитать [точные инварианты и проверки](docs/DEVELOPMENT-REGRESSIONS.md). Аудитировать готовые артефакты; повторы между самостоятельными паками допустимы. Исходные мастера сохранять вне runtime. Подготовить exact companion перед игровыми тестами; выбранные проверки и offline HTML доказывают только свой scope. Релиз/публикация требуют отдельного поручения.

## Владение средствами разработки

Общие навыки, операционные инструменты, roadmap, Cloud/test/release инструкции — в [utils](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/PROJECT.md). Здесь остаются продуктовый код, SDK/правила/ассеты, авторские контракты и собственные проверки. Operational scripts — совместимые shims; установите соседний utils либо PLAYROOM_UTILS_ROOT. Не копировать реализацию обратно.

`docs/TESTING.md` и `docs/RELEASING.md` — только переходы на canonical utils-документы для совместимости инструментов; содержимое руководств не дублировать.

Important update Push is operator-only and opt-in. Never send an update announcement unless the owner explicitly instructs sending that particular important update; release/build/deploy requests are not authorization. announce-update.mjs is dry-run unless --send is explicit. Never invoke the announcement RPC as a deployment smoke test.
