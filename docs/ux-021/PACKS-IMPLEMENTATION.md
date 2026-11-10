# A30 · Игры и обновления

Дата: 2026-11-02. Основа: owner-decisions-7 `packs=0`, connected prototype, `fidelity/reference-packs-{390,844}.png`, `UX-STRUCTURAL-REVIEW-02.md`. Реальные списки из15 игр требуют компактных повторяемых строк; количество карточек не копируется из demo.

## Компоновка и возможности

Заголовок — «Игры и обновления». Вкладки Установлено / Доступно, затем тихая проверка каталога/статус; установка и обновление выделены там, где действительно доступны. Один details на установленную игру: summary содержит исходный art, название, версию/размер/статус и chevron. Нет двойной рамки, отдельной строки «Действия с игрой» и пяти постоянных кнопок. Раскрытие сохраняет подписанные вверх/вниз, скрыть/показать, избранное и удаление конкретной версии.

Установленные игры показывают доступное обновление; Available содержит новые игры, а не второй список тех же обновлений. Известные названия берутся из установленного каталога или canonical bundled manifest, затем из optional catalog name; неизвестный id не заменяется выдуманным названием. Кнопка установки нового пака — primary. При отсутствии размера он не изображается как известный объём загрузки.

В «Дополнительно»: импорт файла, `[data-cloud-data-open]` в A29, удаление неактивных версий/всех игр, восстановление встроенных и quarantine. Весь pipeline измерения диска/облачной квоты удалён из PackManager; он принадлежит A29. Партий и файлов ради совпадения со скрином не удаляли.

Импорт по-прежнему проверяет размер/формат и показывает trust preview перед install. Новый preview или ошибка переводит фокус/прокрутку к фактическому названию/версии/сообщению; fixed Install больше не оказывается видимым при скрытой выше целью установки. Cancel возвращает исходную позицию списка. Успех выделяет установленную игру. Async завершение не открывает закрытый manager заново.

Catalog loading использует один выполняющийся запрос и frame/epoch guards. Его завершение сохраняет раскрытые details, исходные строки, scroll и действующий фокус; закрытый manager не восстанавливается поверх чужих настроек. Подтверждения удаления возвращаются через capability общего modal registry к исходному DOM manager. Связанные локальные/сетевые сохранения продолжают учитываться прежним removal plan и отдельным вторым подтверждением. Удаление при активной сетевой комнате остаётся запрещённым.

Работа установки показывает настоящий счётчик установленных игр, через общий StatusMeter; проценты скачанных байтов не придумываются. Ошибка Available и Retry показаны один раз. Quarantine warning вычисляется по актуальному числу записей, поэтому удалённая запись не продолжает показывать устаревшее «1».

Файлы: `app/pack-manager.js`, scoped `app/packs-021.css`, по одной регистрации asset в index/SW. A29 `cloud-saves-ui.js` и его tests не менялись. A10 read-only lookup gap остаётся открытым.

## Выбранные проверки

1. `PLAYROOM_CAPTURE_DIR=.../packs-021 node scripts/codex/test.cjs case/pack-update-notice-browser --name 'pack manager 0.21'` — Chromium **1/1 PASS**, exit0.
2. Тот же выбранный случай с `PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_PACKS_ENGINE=webkit` — WebKit **1/1 PASS**, exit0.
3. `node scripts/codex/test.cjs case/pack-update-notice-browser --name 'update all installs valid packs'` — **1/1 PASS**, exit0: валидные bundle/SHA, ошибка одного обновления, повтор оставшегося, сохранение display preferences, удаление неиспользуемых старых версий.

Новый случай — переписанный старый quota/stale-opening test. В каждом engine7 report phases, pageerrors[], nativeSupabaseRequests0. Проверены360×740,390×844,844×390, отсутствие horizontal overflow, tabs44px, light/dark, исходный DOM строки после favorite, отсутствие storage measurement, catalog error/retry, закрытие manager→настройки→поздний ответ без подмены DOM, invalid import, явный preview→install, bbox названия preview внутри viewport, Cancel→исходный scroll, hide/show/favorite/reorder, remove cancel→исходный manager/scroll, реальное удаление и quarantine persistence.

Normal Available проверен положительной fixture: новый API4 bundle проходит настоящий `RemoteCatalog.install` → SHA/parse/install. Catalog/file fetch при этом изолирован локальным портом; это не production/R2 availability и не сетевой throughput. Quarantine запись подготовлена в локальных serialized данных fixture; проверены её UI подтверждение и сохранение удаления, а не вся классификация повреждённых паков.

Артефакты: `tmp_files/ux-021/packs-021/{chromium,webkit}-packs-report.json`, `*-packs-installed-{360,390,844}.png`, `*-packs-installed-dark-390.png`, `*-packs-available-error-390.png`, `*-packs-available-ready-{390,844}.png`, `*-packs-import-preview-390.png`. Журналы выбранных случаев — `dist/test-results/case-pack-update-notice-browser-*.log`.

Это3 выбранных запуска, не полный `ui.test`, не весь browser suite и не физический iPhone/Android file chooser. Отдельный legacy pack-notification test не переносился в этом scope.

## Контракт интеграции

- Manager `.pack-manager-modal[data-ui-surface=screen]`, содержимое `.packs-v021`.
- Вкладки `[data-pack-tab=installed|available]`, панели `[data-pack-tab-panel]`.
- Установленная строка `[data-installed-pack][data-pack-id][data-pack-version]`; единый `[data-pack-details]>summary`.
- Каталог `[data-pack-catalog-refresh]`, `[data-pack-update-all]`, индивидуальный `[data-pack-online]`.
- Глобальный `[data-pack-maintenance]` содержит прежние функциональные data hooks; A29 вход `[data-cloud-data-open]`.
- Старые `.pack-entry`/`.pack-row-controls` больше не являются компоновкой этого экрана. Селекторы старых широких тестов следует переносить на семантические hooks, не возвращать icon toolbar.

Функциональный scope зелёный; независимая финальная visual сверка compact summaries и видимого preview передана дизайнеру отдельно.

Независимая финальная сверка A30: дизайнер просмотрел compact Installed390/844, видимый ImportPreview390, AvailableReady390 и AvailableError390. Для этих выбранных состояний приняты single-details структура и override на реальные15 игр; blocker скрытого названия/версии перед Install закрыт. Это не global/physical visual acceptance.
