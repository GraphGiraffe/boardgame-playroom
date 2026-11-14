# Единый одноразовый вход визуальных поверхностей

Статус: source frozen; четыре адресных existing browser cases прошли в Chromium и WebKit, host-transfer unit8/8. Сборку и публикацию выполняет root отдельно.

## RED и результат

Existing notification motion case воспроизвёл повторный вход уже показанного баннера: при app reduced→normal появлялась новая `ui-banner-in` на том же DOM (expected0, actual1). Причина совпадала с предыдущим ModalController bug: постоянный preference selector назначал entry старым элементам заново.

Теперь все producers используют один helper: notification banner, host-offer banner, toast, reaction picker и game-chat drawer. ModalController использует тот же код. Показанные элементы не входят повторно после app/system reduced→normal. Новые normal элементы сохраняют entry, новые reduced — не анимируются. Native popover transition/starting-style не менялись.

## Общий контракт

`PlayroomDOM.prepareVisualEntry(element,{target,document})` возвращает `{start,finish}`. Подготовка выполняется до mount, `start()` — после DOM adoption. Для инертного template.content передаётся owning document хоста. `enterVisual(connectedElement)` объединяет эти шаги и возвращает exact cleanup; `finishVisualEntry(element)` завершает текущую capability.

Один WeakMap владеет активными capabilities. Producer animation flags и отдельные engines не добавлены. Завершение/cancel собственной CSS-анимации, reduced, hidden, удаление DOM или удаление entry marker расходуют capability. Child animations не завершают родительский вход. Временный observer и listeners/timer очищаются; natural CSS completion остаётся основным механизмом, прежний bounded fallback сохранён.

Поздний cleanup сравнивает точную capability, поэтому не снимает новую анимацию повторно используемого DOM. `retireVisual` сначала сохраняет текущую позу, затем завершает entry и запускает прежний exit. Логическое закрытие/ownership/ACK не откладываются.

## Особенности producers

Notification render сравнивает Set живых узлов до keyed update: entry получают только новые nodes. Изменение текста сохранённого баннера не создаёт новый вход. Если keyed patch снимает императивный marker во время entry, capability завершается, а актуальные текст и DOM сохраняются. Clear синхронно освобождает текущие entry перед удалением private banner DOM.

Toast входит только при fresh show. Замена текста уже показанного toast не создаёт новый visual lifetime; cleanup адресует конкретный элемент/capability, а не глобальную переменную noticeElement. В app.js изменён только toast function. Другие его функции и callback semantics сохранены.

Host offer добавляет только entry hook; consent, provider, expiry и private preparation не изменены. Picker и drawer получают тот же helper; direct drawer dismissal завершает capability перед remove. Их существующие exit/gesture/focus/draft правила сохранены.

## Проверки

Все команды выбирали существующий case; whole suite не запускался:

- `case/community-actions-browser`, `community notification routing: only presented list anchors replace banners and never mark messages read`:1/1 в каждой engine. Banner/toast preferences, fresh enter, exit, replacement, instant setting/system restore, private retirement; nativeSupabaseRequests=0, errors=[].
- `case/pairing-methods-browser`, `nearby choice 0.21: shared panels retain the source and reject stale options`:1/1 в каждой engine. Modal entry, initial reduced, interrupted entry, native focus/selection, rapid Back/reopen, gesture, exact capability, removal, child30ms vs parent, keyed update во время entry. Native popover finite close/reopen остался зелёным.
- `case/host-transfer-browser`, `host offer 0.21 shares the surface stack and restores the exact room chat`:1/1 в каждой engine. Passive offer preferences, native consent panel/exit, decline/cancel/accept, retained chat/channel/draft; nativeSupabaseRequests=0, errors=[].
- `case/lobby-layout-browser`, `game overlays 0.21: room context, native menu focus and resized RTC chat preserve the scene`:1/1 в каждой engine. Drawer и picker app/system restoration в двух ориентациях и двух режимах, fresh entry, finite exit/reopen, draft and same scene; local RTC fixture, nativeSupabaseRequests=0, errors=[].
- `case/host-transfer`:8/8. Browserless fixture дополнен отсутствовавшими visual helper mocks; прежние protocol assertions сохранены.

Две первоначальные browser команды не исполнились из-за transport/deadline automatic review; разрешённый повтор прошёл тем же approval path. Это не обход проверки. Неразрешённых approval blockers в данном пакете нет.

Физический телефон, account gate и итоговая сборка являются отдельной приёмкой root. Правила/данные/прочие паковые исходники не изменены. `core/input.js` остаётся SHA256 `f43c042e71afef671bb20d4e83f2be33d8dc59366ac5a4612837e6f2b6664339`.

## Артефакты

`tmp_files/ux-021/nonmodal-entry/final-manifest.json` фиксирует hashes, scope и результаты. Рядом immutable copies восьми JSON reports, RED и final logs. Общий DOM SHA256: `6c895cb3279eab68cbab5c12daaa08664675c0e22c4b240cdbf6d774e95768a5`; mobile surfaces CSS: `c5c2ae5dcf3c307fa9d2d9e3a7429968e8e60d304d4a87e2508cbede9678e240`.

## Итоговая сборка и публикация ведущим

Canonical app build exit0,8SHA/3ZIP CRC корректны;230runtime файлов побайтно совпали с source ZIP. От revision2 изменены только7runtime файлов общего lifecycle и producer hooks, SDK/правила/сеть/Push/паковые исходники не менялись. Exact source-state.json лежит в tmp_files/ux-021/nonmodal-entry/.

Готовый standalone: `tmp_files/ux-021/nonmodal-entry/final/playroom-all-games.html`, SHA256 `60f744e2a2dee617bc38dc2fb8ee1a7a1ee4afaacc3caea2925c867df98712ac`. Тот же app0.21.0-preview.1 / bundled companion0.8.9-preview.3,15игр. Chromium/WebKit по24состояния точного HTML с **обычным** motion: формы/черновики/полное закрытие/новое окно с пустым password, правила, лобби, партия/меню/Stop/Cancel; failures/errors/nativeSupabase0. Дополнительно account CLI WebKit1/1 на новом helper. Новый Chrome CLI не запускался из-за таймаутов согласования; его поведение покрыто actual HTML route, не объявляется новым полным provider прогоном.

По ранее явному разрешению полная PWA обновлена в корне Funnel443/8443, standalone-ссылка тоже обновлена. Root иsw скачаны через публичный IP185.40.234.37 без прокси и совпали с локальными байтами:

- PWA index SHA256 `7aa01a87e410b06e820c00dc6e135e084350e6a890b8f8a8d0ad63cac908bf82`.
- SW SHA256 `502ae1397757f8d7173407f2575b87a9e1a3b3d1d001bf4a562bdac0d4e671b8`.
- Живой Chromium: activated, точный cache `playroom-pwa-v0.21.0-preview.1-d73e72a29187c4d1`,15игр/PushManager; failures/errors/nativeSupabase0. Отчёт live-pwa/chromium-report.json.

Проверка понятности отделена от подсказанного маршрута в OWNER-ACCEPTANCE.md; основные устаревшие положения GOAL о теме/действиях карточки/метаданных синхронизированы. Внешняя доставка Push, физические iPhone/Android и исходный телефонный DnD не считаются принятыми. Production SQL, immutable Pages/R2/Cloudflare release и рассылки не выполнялись.
