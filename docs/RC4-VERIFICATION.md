# Проверка и выпуск RC4

Состав: приложение 0.16.0-rc.4, паки 0.5.0-preview.3. Контракты: [RC4-CONTRACTS](RC4-CONTRACTS.md), приёмка: [RC4-IMPLEMENTATION](RC4-IMPLEMENTATION.md).

## Локальные результаты

- Точечные правила/браузер: 98/98 (rc2-games, rc2-games-browser, ui). Геометрия новых игр: 320/390/768, короткий landscape 640×280, desktop; в Лудо три кубика.
- Проверки фильтров, лобби и PWA: пройдены; исправлен precache новых модулей тегов.
- Сравнение RC3/RC4: локальный `tmp_files/rc4-ui/comparison.html`, до/после для главного меню, Ятзи, Морского боя, Акулины и Лудо. Большой текст 20px проверен на мобильном экране, без выхода страницы за границы.
- Самостоятельный gate паков: 41 JS, пример private-counter, 12 JSON, 14 SHA256 — exit 0.
- Установленные плагины PlayRoom 0.1.1 обновлены; исходники в отдельных tooling PR #58 приложения и #22 паков. Уже запущенные MCP-процессы остаются на прежней версии до новой сессии; новая CLI-инспекция проверена.
- Полный совместный gate `bash scripts/codex/check.sh --full --packs-dir ../playroom-paks/packs`: exit 0, **788/788**, skipped 0. Ядро 73, ввод/эффекты 90, игры 347, UI 128, сохранения 35, сеть 68, подключение/PWA 47.
- Финальная поправка сетевой звуковой последовательности дополнительно проверена существующим блоком `node --test --test-name-pattern='Real browser UI' tests/ui.test.cjs`: **18/18**, exit 0; draw → success → victory сохраняется полностью.
- GitHub/production: опубликованы и проверены, см. результат ниже. Полный локальный gate заменяет повторный необязательный тестовый Actions-run; запускается только deployment workflow. API branch protection вернул 403 (ограничение тарифа); конфигурация защит не менялась, PR status rollup проверяется перед слиянием.

## Границы проверки

Браузерная автоматизация выполняется в Chromium. Физические вырезы экрана, системное масштабирование Android и проверка на реальных телефонах остаются частью пользовательской приёмки RC. Существующие сохранения используют прежние точные версии паков; автоматической миграции на новые правила нет.

## Публикация 13 октября 2026

- [Приложение v0.16.0-rc.4](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.16.0-rc.4): `efe9b29727071fd3f9437b12ddb4d129b2e8c146`, PR #59 → dev. Проверенное исходное дерево совпало с деревом squash-коммита.
- [Коллекция v0.5.0-preview.3](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.5.0-preview.3): `705035c03409bbcda24f8316e5b22d195e74307c`, PR #23 → dev; точный тег закреплён workflow приложения.
- Оба prerelease опубликованы; скачанные assets прошли 6/6 и 14/14 SHA256. Приватная обёртка отсутствует в GitHub assets.
- [Единственный Actions-run 38354809606](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38354809606) завершился success, deployment report имеет `status: published` и тот же SHA/PWA-хеш.
- Production: https://playroom-hod-test.pages.dev, deployment `abf9057d-f0ec-4cd2-92df-16c7b82d59ba`; предыдущий `8876c76c-ae20-47be-a42b-c4f82b0d064f`. Workflow проверил защиту, байты ресурсов и offline. Preview не создавался.
- Stable main не изменён. Плагины 0.1.1 остаются в отдельных Draft PR #58 / #22.
- Локальная передача: `tmp_files/release-0.16-rc4/PUBLICATION-RESULT.md`, приватный `playroom-0.16.0-rc.4-manual-deploy.zip` с SHA256 и `bash scripts/deploy-local.sh`; сравнение экранов — `tmp_files/rc4-ui/comparison.html`.
