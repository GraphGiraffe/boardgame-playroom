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

Публикация пока не подтверждена. Точные commit/tag, assets SHA, Action и URL должны быть добавлены после фактического выпуска и успешного deploy-report.
