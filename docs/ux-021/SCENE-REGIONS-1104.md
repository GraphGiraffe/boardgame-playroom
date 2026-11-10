# Регионы колонок пасьянсов — 4 ноября 2026

Статус: реализовано, проверено и опубликовано во временном превью c7bcd6/cache4f8f6a. Это первый участок регионального построения, **не завершение требования точечного рендера**.

## Реализация

Registry в core/ui.js предоставляет pack-renderer необязательный `ui.region(id, dependencies, build)`. Запись содержит только последнюю сериализованную зависимость и строку разметки; callback не сохраняется. Кэш принадлежит WeakMap-владельцу поверхности, имеет отдельные scene/field lanes, максимум128регионов; неиспользованные записи удаляются. Смена game/version/viewer/audience/surface/replay/hotseat/renderer/appearance resolver сбрасывает соответствующий lane. Без владельца portable/stateless renderer работает прежним способом.

Владелец передаётся приложением внутренним параметром renderOwner: локально — объект session, network/history — controller. Параметр удаляется до вызова pack renderer. Пак не получает authority session/controller. Тест явно проверяет отсутствие renderOwner в UI-контексте пака. Входами renderer остаются авторизованные scene/actions.

Канонический shared/components/game-components.js разделяет описание карты (включая актуальные локализованные label, attrs, entity и asset params) и построение SVG. Обычный card API сохранён. В solitaire-board каждая tableau колонка использует полные описания своих карт, empty target/label и hint. Поэтому неизменённая колонка не строит SVG повторно, а изменения legal attrs/выбора/подсказки/закрытой карты инвалидируют нужную разметку. Префиксы открытых/закрытых карт вычисляются за один проход вместо повторных slice/filter.

Изменение общего embedded-компонента затрагивает bytes всех паков: всем15 назначены новые preview-версии, collection0.8.9-preview.4; solitaire-board0.2.1. Старые опубликованные bytes не переписывались. Подготовлен новый companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`. Сгенерированная host-копия соответствует каноническому модулю с его SHA256 provenance header.

## Проверки и evidence

- case/views22/22PASS, skipped0. Два новых контракта: scope/изоляция/lane/invalidation и фактическое отсутствие повторной генерации карт в колонках Spider/Klondike. Для переноса перестраивается меньше общего числа tableau карт. Cached markup побайтно совпадает со stateless после хода, выбора и hint.
- Расширение того же сценария undo→draw:1/1PASS; cached markup сохраняет актуальные команды и карты после обоих действий. В первой версии проверки порядок draw→undo был неверен для default Spider undo:last (добор — барьер отмены); тест исправлен под настоящие правила, domain не менялся.
- Один старый standalone assert ожидал class первым атрибутом SVG. Сохранены direct-child SVG, точный class и accessible label; допускаются предшествующие xmlns/viewBox канонического vector renderer. Остальные проверки не ослаблялись.
- Точная HTML-сборка `c7bcd66449151f916065fe6c183ddda12ad761f880b1a9d35f984fd818840130`: настоящий Spider перенос одной карты,move0→1,rendererIdentityStabletrue,busyfalse,errors[]. AssetResolver за измеренное действие вызван для **10 изображений карт**, при54картах в tableau. Это конкретное устранение повторной генерации, не измерение общего INP/ускорения. Seed случайный, статистического A/B нет. Снимок spider-after.png просмотрен.
- Существующий native-touch Spider normal-speed/real-start:1/1PASS Chromium. Проверены добор10reveal, выбор без удерживания, partial-overlap drop, commit и отсутствие busy-lock.
- Существующий native-touch Klondike group при50%:1/1PASS Chromium. Группа из3карт, отмена/end/cancel без команды, затем один легальный drop, ошибки0. Это shared-input/rules fixture, не полный app authority сценарий.
- Build8SHA256/3ZIP CRC, source ZIP233runtime/test файла совпали. Новые runtime-файлы относительно прошлого кандидата: app/app.js,app/shared-views.js,core/ui.js,generated core/game-components.js иcore/shared-assets.json. Сверены все230runtime-позиций freeze;225не изменились.

[Материалы итерации](../../../tmp_files/ux-021/scene-regions-1104/): own-changes.patch,source-state.json,versions.json,views.log,solitaire-regions.log,clean-result.json/trace/CPU,spider-after.png,native-spider.log/native-klondike.log и каталоги снимков. Первая попытка изменения generated host-копии была перезаписана prepare; правка перенесена в canonical source и companion подготовлен заново. Проверка совпадения canonical/host учитывает штатный vendored SHA header.

## Незавершённые границы

Внешний authored recipe ещё собирается целиком; полная HTML-строка ещё парсится GameScreen.update. Для held field scene authored renderer может вызываться дополнительно. Остальные игры пока не используют региональное построение. Производительность около100мс, весь DOM/геометрический diff, боты/звук/обучение всех игр, WebKit новых native сценариев, реальные устройства/сети/OS Push/AT/usability остаются отдельными открытыми требованиями0.21. Полная GOAL не закрывается этим адресным результатом.

## Дополнение: применение скинов и публикация

Добавлен адресный сценарий в существующий solitaire-browser.test.cjs: `screen:phone cached solitaire columns keep applied skins through subsequent commands`. Проверка выполнялась на точном compiled HTML c7bcd6, response SHA проверен, посторонние запросы заблокированы fixture. Chromium1/1PASS и WebKit1/1PASS; в каждом случае обе игры.

Через публичный PlayroomAppearanceUI.show открывается настоящее оформление, затем выполняются реальные клики Компоненты→mini-split→Применить. Выбранная физическая карта и её control node сохраняются. Подсказка и последующий committed draw не возвращают прежние inline-index SVG; колонка/scroll nodes сохраняют identity. Ошибки0, nativeSupabaseRequests0. Нулевые фактические позиции scroll сохранились; ненулевой scroll этим сценариием не подтверждён. Programmatic entry не доказывает discoverability пункта меню. Снимок WebKit Spider после добора просмотрен.

Сборка после добавления теста сохранила тот же runtime HTML SHA c7bcd6;8SHA/3ZIP проверены заново для обновлённого source ZIP,246runtime/locale/test файлов совпали. Имена и hashes pack source manifests/shared components/renderer сохранены в source-state.json.

Разрешённые Funnel443/8443/standalone переключены на final этой итерации. Четыре публичные загрузки совпали побайтно; полный standalone проверен64KiB ranges с проверкой Content-Range/длины. Service worker activated, cache/buildIdentity `playroom-pwa-v0.21.0-preview.1-4f8f6a39e54000d5`,15игр,downloadProtocol1,errors0,nativeSupabaseRequests0,source drift0. Ready/offline snapshots390×844 и844×390 без overflow.

Существующий pwa-offline сценарий дополнительно прошёл reload, cold page, запуск Domino, сохранение партии и сохранность профиля без сети. Это приёмка оболочки и конкретного Domino-сценария, не офлайн-функционала всех15игр. StaticFunnel `/api/packs/catalog` по-прежнему404, встроенные пакеты доступны. Stable Pages/R2/SQL не менялись.

URL: https://seth.tail6aebd4.ts.net/ ; также8443 и /hod-021.html. Evidence: skin-chromium.log,skin-webkit.log,skin-*/{spider,klondike}-region-skin.json/png,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json. Предыдущие границы полнойGOAL и полногоHTML-парсинга остаются открытыми.
