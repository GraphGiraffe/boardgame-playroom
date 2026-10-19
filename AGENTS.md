# Работа с ХОД 0.18

Приложение 0.18.2, коллекция 0.7.1; engineApi 3, viewApi 2, protocol 2. Начните с [индекса](docs/DEVELOPER-INDEX.md), [архитектуры](docs/DEVELOPER-ARCHITECTURE.md), [механик](docs/MECHANICS.md) и [Roadmap](docs/ROADMAP.md). Публикация подтверждается [release evidence](docs/RELEASE-0.18.md), не номером в исходнике.

- Проверьте root/status/ветку и live-состояние. Соседние проекты и чужие изменения сохранять.
- domain игр принадлежит отдельной коллекции; application принимает порты, platform/web реализует их. Общие компоненты не узнают game ID.
- Только API 3, без legacy runtime; старые данные сохранять для экспорта, опубликованные версии не переписывать.
- Authority у хоста; сеть получает проекции, не Session.export. ACK после durable commit; commandId не создаёт второй ход. Resume-token не входит в QR/snapshot/логи.
- Fixed scene по умолчанию. Динамическая геометрия только opt-in конкретного действия; не всего пака. Публичность проверяется до renderer/эффектов.
- Канонические shared assets/compiler в коллекции; generated host copies обновлять явной companion сборкой, не руками.
- Не коммитить dist, generated installed packs, секреты, личные данные/private Worker/ZIP.

## Проверки

```sh
bash scripts/codex/setup.sh --packs-dir ../playroom-paks/packs
node scripts/codex/test.cjs core,input,games,ui,storage,network,pairing
```

Полный список нужен для сквозного релизного риска; для задачи выбирать blocks/case из [TESTING](docs/TESTING.md). Без companion не заявлять проверку игр. Build/SHA256 обязательны для выпуска. UI: 320/390 portrait, короткий landscape, scroll/drag/swipe, private views, history, motion, стабильность размеров до/после действий. Сначала существующие сценарии.

## Ветки

Task branch → Draft PR → dev squash. Stable: dev → main merge commit, затем fast-forward dev без force. Проверки/Actions вручную, push/Ready их не запускает. [CONTRIBUTING](CONTRIBUTING.md), [RELEASING](docs/RELEASING.md). Очистка только по доказанному включению изменений, с backup и сохранением уникальных работ.
