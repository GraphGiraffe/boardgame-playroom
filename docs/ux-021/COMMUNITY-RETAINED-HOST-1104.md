# Сохранение root Общения и режима ввода — 4 ноября 2026

Статус: исправлено, выбранные source/готовый HTML сценарии пройдены, временное превью опубликовано и проверено. Полная GOAL0.21 остаётся открытой.

## Пользовательский дефект и причина

Реальная последовательность вход → Общение → Мои партии → Общение возвращала пустой root: видны только общая навигация и заголовок. AccountService при этом оставался account, busyfalse/errornull; JavaScript errors[]. Это не отсутствие аккаунта и не отказ сервера. Диагностика сохранена в `navigation-diagnostic/chromium-report.json`.

Hub заново передавал общий renderer пустую оболочку `[data-hub-community]`. DOM-патчер сохранял сам элемент, но удалял управляемых детей. CommunityUI продолжал считать view действительным по owner/connected host; `[data-community-content]` уже отсутствовал, поэтому render ничего не рисовал.

`PlayroomDOM.manageChildren(host)` теперь выдаёт runtime lease на дочернее поддерево. При обновлении родителя атрибуты/позиция контейнера обновляются обычным способом, а дети остаются у своего контроллера. Прямой `ListController.update` владельца продолжает обновлять содержимое. Новый контракт не распознаётся из markup/data-атрибута. Disposer снимает только свою актуальную lease; старый disposer не снимает более новое владение.

CommunityUI получает lease при создании root view и освобождает при dispose. Уже существующие owner/revision/account guards и очистка данных/queries при смене аккаунта сохранены. Возврат и passive Hub repaint сохраняют сам native input/list/card DOM, а не реконструируют их из innerHTML и не начинают новый сетевой сеанс ради восстановления оболочки.

## Лишние глобальные записи

В `core/tooltips.js` `publishInput` раньше при каждом keyboard navigation событии повторно записывал `data-input-modality` на html. Расширенный существующий сценарий с исходным writer дал meaningful RED:2 записи на двух клавишах при уже keyboard-режиме. Теперь значение сравнивается с фактическим DOM, повторные записи0. Внутреннее состояние всё равно синхронизируется; после destroy/attach отсутствующий атрибут восстанавливается. Семантические игровые выделения не заменяются декоративным focus outline.

Нового ускорения/FPS этой правке не приписывается: измерены записи атрибута и функциональное поведение. Прежняя остаточная длинная задача79мс не объявляется устранённой.

## Проверки

- Окончательный HTML SHA проверен из фактического ответа в `application tabs keyboard: one tab stop, scoped activation and retained forms`: Chromium1/1, WebKit1/1 PASS. Auth validation/сохранённые формы и вкладки, возврат root, touch textbox/owned select, смена touch→мышь→keyboard, first-player semantic outline и настоящая выбранная карта UNO сохранены. Проверены2→0 одинаковых keyboard-записей и destroy/attach. В обоих reports errors[],nativeSupabaseRequests0.
- Chromium156.0.8078.47 и WebKit26.6 записаны в artifact entries. WebKit-проверка на `final-owned` переиспользована: её HTML побайтно равен `final-ready`; между ними изменился только assertion о значении поля поиска. Native Escape очищает search в Chromium, но не в данном WebKit; сравнение двух последующих стрелок теперь использует значение до этих событий. Более ранний Chromium запуск упал на необоснованном ожидании исходного текста, не на focus/root-write контракте, и не засчитан как PASS.
- `community ownership: passive root repaint and retired reads/actions preserve the current surface and identity`: source Chromium1/1 и WebKit1/1 PASS. Реальное завершение загрузки каталога вызывает Hub repaint; exact community input/list/card/focus/selection/scroll сохраняются. Held refresh, возврат из настроек, поздние hub/chat/action ответы, logout/login другого аккаунта и отсутствие людей предыдущего владельца проверены. Это fixture HTTP/Auth/RPC, не реальные серверные аккаунты или устройства. Reports errors[],nativeSupabaseRequests0, копии в engine-specific ownership папках.
- `case/tooltips`: source3/3 Chromium и3/3 WebKit PASS: ARIA/клавиатура, viewport/gutters, lifecycle, touch hold/release/cancel. Это не полная проверка всех gesture-сочетаний приложения.
- Просмотрен source-снимок `ownership-chromium/chats-390-chromium.png`: root Общения восстановлен, поиск и список на месте. Это не полная visual/usability приёмка.
- Первый patch теста не внёс изменений из-за несовпавшего отступа; следующий запуск выявил пустой root до нового счётчика. Он не назван RED счётчика. Исходный writer проверен отдельно после исправления root, RED2≠0 сохранён в `counter-red.log`.

## Сборка и временная публикация

Из230runtime-файлов относительно предыдущего проверенного кандидата изменились только `platform/web/dom.js`, `app/community-ui.js`, `core/tooltips.js`. Остальные227runtime, все15объектов паков, правила и CSS идентичны. `manageChildren` применяется только к явно зарегистрированным live hosts; прочие игровые поддеревья не получают автоматического сохранения. Предыдущие успешные проверки неизменённых игровых/CSS исходников не повторялись.

HTML SHA256 `a7eb2bba41840ae83671052f2b20b8afc7db007c70b2ff9e61b953913eac1181`.
Cache `playroom-pwa-v0.21.0-preview.1-44581c31451e4cc8`.
App0.21.0-preview.1; collection0.8.9-preview.7,15игр. Build8SHA/3ZIP CRC/source250 совпали, финальный source drift0. Текущий артефакт — `final-ready`; `final` и `final-owned` промежуточные.

Разрешённые https://seth.tail6aebd4.ts.net/ ,8443 и `/hod-021.html` обновлены. Public4files совпали; standalone целиком сверён64KiB ranges с206/Content-Range/length и общей SHA. Внешний системный Chromium: activatedworker, точныеcache/buildIdentity,15игр/downloadProtocol1; offline reload/coldPage/Domino/save/profile PASS;6viewport states безoverflow; errors[],nativeSupabaseRequests0,sourceDrift[]. Проверка TLS не отключалась. Static `/api/packs/catalog` не заменяет защищённый API. Push delivery/real provider operations не проверены этим smoke; SQL/production/R2 и посторонние службы не менялись.

[Evidence](../../../tmp_files/ux-021/input-mode-writes-1104/): final-manifest.json,source-state.json,public-check.json,live-pwa,keyboard-final-chromium.log,final-chromium/chromium-report.json,keyboard-webkit.log,webkit/webkit-report.json,ownership-chromium/webkit.log и папки,tooltips-chromium/webkit.log,counter-red.log,navigation-diagnostic. Общие исходные screenshots/reports Community также в `tmp_files/ux-021/community-owner`.

Остаются остальные требования A01–A36, общий recipe/точечные зависимости всех сцен, остаточная задержка, физические устройства/сети/AT/слышимость и независимая usability. Исправление root и нескольких лишних записей не закрывает весь GOAL и не переносит его открытые дефекты в SDK.
