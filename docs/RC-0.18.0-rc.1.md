# PlayRoom 0.18.0-rc.1 / collection 0.7.0-rc.1

## Область и совместимость

Кандидат полного рефакторинга приложения и 12 паков. engineApi 3, viewApi 2, container 1, network protocol 2. Старые опубликованные 0.17.6 / 0.6.5 не меняются. Их данные не запускаются в новом runtime и не удаляются; UpgradeService предлагает выгрузку localStorage/IndexedDB и явный переход.

Реализация включает независимые domain/presentation/locales/Web слои всех игр; общий compiler, Session/processor/journal, комнаты/подключение/recovery/history services, стабильный DOM, общие material/skin компоненты и локальные темы, личный экран при подключённом сетевом Столе, справки и применимые окончания/ограничения раундов. Действие, ход и раунд разделены; история и сохранения используют явные публичные границы/метаданные. Полный чат/новые уровни стратегий ботов остаются отдельными продуктами Roadmap.

## Локальная проверка 2026-10-16

Выбран сквозной состав `core,input,games,ui,storage,network,pairing`; это явный выбор для API миграции, без изменения defaults патч-релизов. Первый совместный запуск выявил ошибки; он не обозначается зелёным. После исправлений повторены только затронутые файлы/сценарии.

- Ядро: 143/143; ввод/эффекты: 91/91; storage/recovery: 37/37 в совместном запуске, без skips.
- Для игр/UI/сети/pairing первоначальные отказы устранены: физический порядок мест UNO при reverse; слои веера; fullscreen/settings; соответствие тестовых загрузчиков API 3, полей семантических результатов, новых module paths/текстов и protocol 2.
- Повторены `case/game-layout-browser,case/uno-controls,case/result-team-medallions-browser,case/ui,case/network-feedback-browser,case/presence-transport,case/webrtc-browser,case/acoustic-webrtc-browser,case/pwa-share,case/pwa`. Сеть 9/9 и pairing/PWA 20/20 прошли. Оставшиеся две компоновки повторены после исправления закрытых рук/проверок намеренно скрытого поля.
- Последний `node --test --test-concurrency=1 --test-name-pattern='all packs share|Modal gestures' tests/game-layout-browser.test.cjs tests/ui.test.cjs`: **184/184**, fail/cancel/skip 0.
- Дополнительно на окончательных общих контрактах: GameModel паков/целостность timeline **12/12**; GameScreen/view contract **21/21**; compiler/source contracts **8/8**; template+compiler **17/17**; правила изоляции каталога/превью/production **3/3**.
- Браузерные логи сохраняются в `dist/test-results/`; они не являются release assets и не содержат приватных страниц production.

Совместный full runner не запускался второй раз после точечных исправлений. Отдельный полный прогон паков не дублирует app runner. Учебный API 3 private-counter собирается отдельно с --include-examples; релизная коллекция включает только 12 игр.

## Изоляция публикации

- Приложение: GitHub prerelease `v0.18.0-rc.1`, Pages operation **preview**, channel **0.18-rc.1**.
- Паки: GitHub prerelease `v0.7.0-rc.1`, R2 `channels/0.18-rc.1/catalog/...`.
- Immutable game files имеют отдельные prerelease версии и content hash. Production catalog/current.json не переключается.
- Перед/после превью проверяются canonical production deployment, защищённый runtime, версия/каталог/хэши 12 файлов. Сравнение runtime/catalog должно совпасть. Preview проверяет собственные bytes, пароль, запрет анонимного доступа и offline.
- Preview binding использует существующий PLAYROOM_PACKS и bucket; автоматические Git production/preview builds выключены. Проект не создаётся, production deploy не выполняется.

## Дополнение: сигналы особых действий

Добавлены единые метаданные skip/pass/discard/draw/take/reverse, короткая красная подсветка/встряхивание пропустившего игрока (700 мс, без движения при reduced motion), отдельные стандартные звуки пас/бито/взять. На одно действие выбирается один основной звук; начало своего хода не накладывается на него. Лудо публикует skip при полностью невозможном броске; Домино — при отсутствии выкладки/добора; Дурак — для взявшего карты. UNO reverse при двух оставшихся игроках использует skip и не показывает стрелку направления. Обычный конец хода не помечается пропуском.

После этого дополнения выполнены только затронутые проверки, без повтора полного состава: sound/forced-skip/duel + GameFeedback **7/7**, модели/UNO feedback **15/15**. Браузерные skip/UNO сценарии **12/12**, fail/cancel/skip 0: адресная карточка, очистка через 700 мс, reduced motion, отсутствие повтора, отсутствие стрелки в дуэли и responsive UNO.

## Дополнение: крупный показ хода

Явный публичный reveal contract и общий Web ActionReveal: карта/костяшка удерживается крупно 1000 мс, затем летит к существующему назначению за 240 мс; кубики дублируются без перелёта. Следующий ход ждёт очереди. В Ятзи только принятое сочетание с названием и точными участвующими индексами. Применимость всех 12 паков и ограничения приватности — таблица в SDK-0.18. Копии без команд; reduced motion, очистка, история/reconnect не создают повторов.

Проверки нового показа: модели/feedback 14/14, дополнительные случаи участия кубиков/приватности 3/3; браузерные skip/reveal 2/2 (задержка, перелёт без дублирования, cleanup и silent restore). Полный состав не повторялся.

## Опубликованные файлы

- Приложение: [v0.18.0-rc.1](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0-rc.1), commit `058f2d70f6fecba566574c428235c3dcbb946742`.
- Коллекция: [v0.7.0-rc.1](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.0-rc.1), commit `8ddcbc807b18387079fdf443de394417a9096eff`.
- Оба GitHub Release помечены prerelease, не latest. Независимая загрузка из GitHub подтвердила все 6 файлов приложения и 16 файлов паков по SHA256SUMS, точную пару SHA в release-info.json, состав assets и prerelease flags. Отдельные SHA256SUMS доступны в каждом выпуске. Все ZIP CRC проверены при сборке.
- PR исходной реализации: приложение #117, паки #64; дополнения сигналов/крупного показа: приложение #118, паки #65. Squash в dev; main не объединялся.
- R2 [публикация #38845328382](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/38845328382): запущена с checks=none, channel=0.18-rc.1, bootstrap=true. Успешно; снимок `df4a6532ff0b5d2910b8c0e3a170ac28bc506cae09f2663db1cd9b921737ff49`, обновлены ровно 12 RC паков.

### Подготовка preview

Первая [попытка #38845521677](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38845521677) прошла защищённый production baseline, но закончилась HTTP 400 при PATCH полной preview конфигурации; upload ещё не начинался, deployment не создан. [PR #119](https://github.com/GraphGiraffe/boardgame-playroom/pull/119) изменил только tooling: PATCH writable R2 name/jurisdiction, readback binding/env/canonical и сохранение отчёта при ошибке. 3/3 адресных policy теста, Python compile и diff check прошли. API контракт: [Cloudflare Pages edit](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/).

[Повтор #38846037932](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38846037932) подтвердил preview R2 binding, но остановился до upload на проверке env_vars. [PR #120](https://github.com/GraphGiraffe/boardgame-playroom/pull/120) сравнивает пустые карты переменных семантически (null / {}); тест дополнен этим GET/PATCH round trip, а сохранение непустых ключей/значений и обнаружение смены production каталога остаются строгими. 3/3 policy сценария прошли.

Новая попытка использует tooling SHA `398f1093e62c1e58a1639437903c8f704b0fab47` (dev) и прежние опубликованные immutable app/pack assets, исходную пару SHA и R2 снимок. Runtime и теги не переписаны. Первые две попытки не создали deployment.

## Проверенный preview

**[Открыть PlayRoom 0.18-rc.1](https://51c9a867.playroom-hod-test.pages.dev)**. [Workflow #38846469923](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38846469923) завершён success на tooling SHA `398f1093e62c1e58a1639437903c8f704b0fab47`. Статус скачанного `pages-deployment-report/deploy-report.json`: `preview-verified`, `productionUnchanged: true`. Скачанный отчёт независимо сопоставлен с опубликованными release assets.

| Проверка | Результат |
|---|---|
| Проект | существующий `playroom-hod-test` |
| Единственный созданный preview deployment | `51c9a867-a26a-4898-b6e8-fc93fb2fa1d3` |
| Runtime | `0.18.0-rc.1`, commit `058f2d70f6fecba566574c428235c3dcbb946742` |
| PWA ZIP SHA256 | `75f29e7f6fca9cdfa24568df7c26538f0b7562836d2d423480a16707d238e1b4` — совпал со скачанным GitHub asset |
| Каталог | `0.7.0-rc.1`, канал `0.18-rc.1`, снимок `df4a6532ff0b5d2910b8c0e3a170ac28bc506cae09f2663db1cd9b921737ff49` |
| Паки | 12/12 реально скачанных с preview файлов совпали с SHA256 опубликованных assets |
| Защита | вход по существующему паролю; анонимный доступ к закрытым ресурсам запрещён |
| Offline | PWA/service worker smoke прошёл |
| Production до/после | `0.17.6 / 0.6.5`, полные отчёты версий/каталога/12 hashes идентичны |
| Стабильный canonical deployment | `bddc9741-d208-42a8-adf6-ab8e8de655c9`, не переключался |
| Публикация | checks=none, повторных source suites нет; byte/hash/access/offline checks обязательны |

Первые две попытки остановились до upload. Успешная попытка выполнила ровно одну загрузку preview. Автоматические Git production/preview builds проверены и сохранены выключенными через manual_uploads. Production catalog pointer не переключался; immutable prerelease keys доступны рядом со стабильными файлами.

Реальная пользовательская приёмка RC на телефонах ещё предстоит; это предварительный выпуск, основной сайт остаётся стабильным.
