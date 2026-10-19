# Выпуск ХОД · 0.18

Пара стабильной линии: приложение **0.18.2**, коллекция **0.7.1**. Точное состояние, SHA, проверки и deployment — [RELEASE-0.18](RELEASE-0.18.md). Версии игр независимы. main — stable, dev — integration; опубликованные теги/bytes неизменны.

## Подготовка

1. Проверить ветки, рабочие деревья, PR и точную companion пару. Task branch → Draft PR → dev (squash). Stable PR dev → main **merge commit**, затем fast-forward dev, без force.
2. Согласовать версии package.json/package-lock/sw приложения, build.py коллекции и изменённых pack manifest.json. Manifest.js генерирует builder. Обновить docs/roadmap/changelog.
3. Выбрать проверки явно по риску. Для сквозного стабильного перехода 0.18: `node scripts/codex/test.cjs core,input,games,ui,storage,network,pairing`. Для адресного патча — конкретные blocks/case. `none` означает сознательный пропуск source tests, не успех. Build/SHA/ZIP проверяются всегда.
4. После task PR провести отдельные stable PR. Сборка только из окончательных main SHA с точным companion. Не менять файлы под опубликованной версией.

```sh
# repository playroom-paks
python3 build.py --output-dir dist/release-0.7.1
# repository playroom
python3 build.py --all-games --pwa --remote-catalog --packs-dir ../playroom-paks/packs --output-dir dist/release-0.18.2
```

Приложение поставляет playroom.html, playroom-all-games.html, playroom-pwa.zip, playroom-source.zip, tabletop-core.zip, README-TEST.txt/CHANGELOG и SHA256SUMS. Коллекция — 12 versioned JSON, collection/source/shared-assets ZIP, отдельные asset-pack ZIP и SHA256SUMS. Добавленные provenance/notes включить в пересчитанный SHA256SUMS до загрузки. ZIP CRC и скачанные public bytes проверить независимо.

## GitHub и публикация

Теги указывают на окончательный main SHA; стабильные Releases имеют draft=false, prerelease=false. Сначала можно загрузить draft, скачать и проверить все assets, затем опубликовать. Push/Ready PR не запускают Actions; ручные операции выполняются на закреплённом ref. Не запускать повторную сборку для уже проверенных immutable assets.

Паки публикуются через `packs-publish.yml`: `checks=none`, `release=v0.7.1`, пустой production channel. Immutable files загружаются первыми, catalog snapshot и атомарный current pointer — последними. `only` для одной игры; bootstrap только для отсутствующего каталога. Старые файлы остаются. Откат: тот же workflow с rollback=<snapshot sha>, без release.

Оболочка публикуется через `prerelease.yml`, `operation=deploy`, `checks=none`, `release=v0.18.2` на main. Существующий защищённый Pages project/origin, приватная wrapper и R2 binding сохраняются; автоматические Git builds остаются выключенными. Скрипт проверяет rollback point, скачанные assets, protected runtime/catalog/offline и canonical deployment. Public ZIP **не содержит** private worker/routes/secrets. Не создавать второй проект.

Переход API 3 согласован как общий cutover: зафиксировать старый catalog snapshot и deployment; опубликовать совместимую коллекцию и сразу оболочку. Если app deploy не прошёл, вернуть также старый каталог; app rollback сам по себе не откатывает R2. Установленные старые паки/данные остаются локально; UpgradeService требует явного подтверждения владельца и позволяет экспорт.

Preview только по запросу, с непустым изолированным channel. Если upload выполнен, а smoke не прошёл, проверять **существующий** deployment read-only, не повторять загрузку. `operation=preflight` с release/deployment/pack_channel для preview; без channel — production preflight. Итоговая истина — release record + downloaded hashes + deploy-report, не зелёный build.

## Очистка

Перед удалением refs сохранить Git bundle --all. Только завершённые ветки с доказанным включением изменений, с проверкой exact head перед удалением. main/dev/tags и активные worktrees защищены. Open PR с уникальной работой сохранять; закрывать лишь доказанно заменённый PR. Remote deletion — ref-specific expected-SHA lease. В отчёте указать сохранённые исключения и путь backup. Историю RC не дублировать в текущие инструкции.
