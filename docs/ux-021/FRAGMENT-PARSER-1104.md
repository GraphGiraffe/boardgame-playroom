# Точечный разбор HTML-регионов — 4 ноября 2026

Статус: реализовано, проверено и опубликовано во временном превью. Общая GOAL0.21 остаётся открытой.

## Изменение

Ранее `ui.region` возвращал готовую строку колонки, которая затем снова попадала в полный template.innerHTML. Теперь приложение собирает отдельный внутренний regionSink: authored renderer возвращает инертные placeholders, а Map содержит их HTML. И renderOwner, и regionSink удаляются из UI-контекста до вызова пака. Без владельца/sink portable/stateless API по-прежнему возвращает полный HTML.

GameScreen.update хранит parsed authored roots по владельцу host/geometry identity. Новые/изменённые регионы разбираются отдельно. Для чистого неизменённого региона DOM.patchChildren получает сохранённый authored root и пропускает его содержимое. Старые authored roots переносятся в новый baseline только после завершения diff; **нет cloneNode/HTML-разбора неизменённой колонки на этом пути**. Клонирование остаётся необходимым при создании/восстановлении реально отсутствующего DOM.

У region один самостоятельный корень; вложенные placeholders, отсутствующие/дублирующиеся fragment IDs и более256materializedрегионов отвергаются. Регионы с game-frame/layout/actions/руками/player panels/public frames не используют такой shortcut: они каждый раз разбираются перед штатной подготовкой, чтобы не пропустить её изменения. Смена geometry owner сбрасывает parsed cache, отсутствующие регионы удаляются из следующего baseline. Весь cache принадлежит WeakMap владельца, глобального хранилища приватных HTML нет.

Изменены app/app.js,app/shared-views.js,app/game-screen.js,core/ui.js,platform/web/dom.js. Паковые bytes/версии/companion неизменны: `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`.

## Доказательства

- RED до исправления: initial fragment placeholders не разрешаются в элементы. Существующий game-layout-browser дополнен адресным случаем `scene fragment patches parse only changed regions and retain live input scroll and effects`.
- После исправления: Chromium1/1PASS,WebKit1/1PASS. Начальный разбор A/B, повторный0, изменение B разбирает только B. У A сохранены точный input node, фокус, черновик, caret2–5, **scrollTop17**, runtime style и pausedWAAPI currentTime23. Удалённый регион и целый контейнер восстанавливаются без placeholders; новый geometry owner разбирает A/B заново. Имитация preparation port проверяет, что player-panel всегда проходит свежую подготовку. Первоначально неполная тестовая заглушка не имела bind; исправлена заглушка, не product path.
- Контракт region owner/sink:1/1PASS. В pack UI нет authority owner/sink; stateless результат остаётся полным HTML.
- Точная HTML-сборка `b3f3c8f257295a85373d18afc891c83b743451fc6ca0e7c984b4c232eef30831`: настоящий Spider move0→1,busyfalse,rendererIdentityStabletrue,errors[]. За действие HTML-парсер получил общий skeleton с10placeholders и **3колоночных фрагмента/17карт**, вместо повторного разбора всех10колонок/54карт. В live DOM placeholders0. Доступность действий тоже входит в зависимости колонок. Seed случайный; статистического ускорения/INP/FPS этим не заявляется.
- ExactHTML skin-after-command:1/1Chromium+1/1WebKit, в каждом случае Spider/Klondike. Skin, selected physical card/control и column nodes сохраняются после применения, hint и committed draw. Ненулевойscroll здесь не был доступен; его проверяет отдельный DOM-сценарий выше.
- Native touch normal Spider/real-start:1/1Chrome; native Klondike group50%:1/1Chrome. После изменения DOM-пути повторены соответствующие сценарии, а не весь набор.
- Существующий ordinary patches/UNO/audience geometry case:1/1Chrome. Путь без fragments сохраняет выбор, геометрию и границы аудитории в пределах этого сценария.
- Build8SHA/3ZIP CRC;246runtime/locale/test файлов source ZIP совпали. Все230runtime-позиций сверены freeze:225не менялись. Canonical pack source hashes и installed companion прежние.

## Публикация

Проверенный кандидат опубликован через прежние разрешённые Funnel443/8443/standalone routes. Stable Pages/R2/SQL и другие службы не изменялись.

Четыре публичные загрузки совпали побайтно; standalone целиком проверен64KiB ranges с Content-Range/length. Live Chromium: activated/cache/buildIdentity `playroom-pwa-v0.21.0-preview.1-f6a6c74b38a10caa`,15игр,downloadProtocol1,errors0,nativeSupabaseRequests0,sourceDrift0. PWA ready/offline6снимков390×844/844×390 без overflow. Offline reload/coldPage/Domino/save/profile PASS. StaticFunnel `/api/packs/catalog`404 остаётся известным ограничением временного сервера; это не smoke удалённого каталога/сети.

URL: https://seth.tail6aebd4.ts.net/ ; также8443 и /hod-021.html.

[Материалы](../../../tmp_files/ux-021/fragment-parser-1104/): red.log,chromium.log,webkit.log,region-contract.log,ordinary-patches.log,skin-*.log,skin-*/json/png,native-*.log,clean-result.json/trace/CPU,source-state.json,own-changes.patch,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json.

## Остаётся

Внешний recipe/skeleton всё ещё строится. Зависимости пока вычисляются для всех колонок; полная замена на явные dirty-region сигналы не выполнена. Регионы пока используются только пасьянсами. Held field renderer, preparation-sensitive области, остальные игры, остаточная задержка около100мс, полная игровая/звуковая/ботовая/учебная матрица, реальные устройства/сети/OS Push/AT/usability остаются открытыми. Этот результат не является всей приёмкой0.21 или готовым SDK следующего релиза.
