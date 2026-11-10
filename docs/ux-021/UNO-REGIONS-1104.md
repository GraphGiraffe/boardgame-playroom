# Точечное обновление UNO — 4 ноября 2026

Статус: реализовано, выбранные source/готовый HTML проверки пройдены, временное превью опубликовано и его внешний PWA startup/offline проверен. Полная GOAL 0.21 открыта. Последующее доказательство внешнего запуска приведено ниже; прежние неудачные попытки сохранены как история диагностики.

## Изменение

Canonical `playroom-paks/packs/uno/view.js`: независимые регионы каждой карты собственной руки, колоды, сброса и направления/активного цвета. У неизменённых регионов повторно используются разметка и физические DOM-корни существующего механизма. Зависимости собственной карты включают разрешённую проекцию, source attributes и selection class; stock — доступную draw-команду и количество; discard — открытую карту, выбранные цели и количество. Смена viewer/surface/replay/owner/asset resolver использует существующие границы region registry. Без региона остаётся полный переносимый HTML-путь.

У закрытой раздачи seed17 повторное построение лиц карт сократилось с 8 до 0. Выбор и ход затрагивают меньше карт, чем вся рука; разметка совпадает с актуальной полной разрешённой разметкой. Не заявляется устранение внешнего recipe, обхода зависимостей, повторной отрисовки открытых рук соперников или общей задержки. Регионов руки не создаётся для скрытых карт соперника; их стабильные приватные ID не раскрываются.

Правила, CSS и shared assets не менялись. Все 230 runtime-файлов приложения и 14 других объектов паков совпадают с предыдущим [кандидатом Лудо](LUDO-REGIONS-1104.md). Collection 0.8.9-preview.7; UNO 0.6.8-preview.5.

## Доказательства

- RED нового случая `UNO regions preserve unchanged card artwork and exact choices across selection and play`: ожидание 0 повторных card-face, фактически 8. После правки весь `case/views` 25/25 PASS: реальный счётчик artwork, неизменённое поле, выбор и разрешённый ход, parity quickPlay/пустых действий/другого viewer/public Table/player surface. Это адресные сценарии, не исчерпывающая проверка всех карт и реакций.
- Готовый HTML: `case/uno-drag --name 'UNO local mobile gestures separate tap selection, hand scrolling and held drag'` по 1/1 PASS Chromium 156.0.8078.47 и WebKit 26.6. Helper проверяет фактически загруженный SHA и блокирует внешние ресурсы; обновлены старые переходы к сохранённой партии на актуальную навигацию. Иные случаи файла не объявляются проверенными.
- Две раздачи на движок: обычная через каталог и длинная через сохранение. Chromium использует native touch/CDP, WebKit — mouse fallback, а не доказательство touch на iPhone. Проверены удержание, отпускание/выбор, смена карты, пустое место, отмена drag, прокрутка и один законный commit. Прокрутка длинной руки 0→180 Chromium и 0→78 WebKit. Во всех четырёх scenarios errors[] и nativeSupabaseRequests 0. Белая внутренняя рамка сохраняет 5-unit band. Просмотрен `chromium-long.png`: он снят во время transfer-эффекта и не является проверкой устойчивого финального положения анимации.
- 8 SHA256 и 3 ZIP CRC PASS; 250 runtime/locale/test файлов source ZIP совпали с текущими исходниками; финальный drift по замороженным source-группам 0. Две первоначальные попытки сравнения паков ошибочно разбирали JS как ограниченный regex-JSON и затем ожидали верхнеуровневый id. Они не засчитаны; выполнена сверка реального массива через JSON decoder и manifest.id.

## Превью и ограничения

HTML SHA256 `20be1076d00768bb4e35b4b60e82143afedb96bc9814c55344086ae4aaa77405`.
Cache `playroom-pwa-v0.21.0-preview.1-75f484c03e3c2caf`.

https://seth.tail6aebd4.ts.net/ , порт 8443 и `/hod-021.html` обновлены. Public bytes 4/4 PASS; standalone проверен целиком диапазонами 64 KiB с 206/Content-Range/length и общей SHA. Внешний Chromium через 8443 остановился до bootstrap с 166 failed requests; ошибки и журнал сохранены. Это не успешный внешний PWA smoke, TLS-проверка не отключалась.

Точный `final/pwa` проверен существующим runner через временный loopback-сервер: active worker/cache/buildIdentity, 15 игр, downloadProtocol1; offline reload/cold page/Domino/saved session/profile PASS; 6 состояний портрета/ландшафта без overflow; errors[], nativeSupabaseRequests0, source drift[]. Static `/api/packs/catalog` даёт ожидаемый 404; встроенные паки работают. Только созданный проверкой сервер остановлен после неё. Stable/SQL/R2, посторонние службы и пользовательские подключения не менялись.

[Evidence](../../../tmp_files/ux-021/uno-regions-1104/): final-manifest.json, source-state.json, source-drift-final.json, views.log, chromium.log, webkit.log, engine-specific reports/screenshots, public-check.json, live-pwa и local-pwa. RED: `tmp_files/uno-regions-red.log`; адресный первый GREEN: `tmp_files/uno-regions-green.log`.

Остаются общая производительность и полный переход сцен на точечные зависимости, внешний запуск, полная A01–A36 и самостоятельная пользовательская приёмка, реальные устройства/сети/AT/слышимость. Наличие регионов в UNO не закрывает другие игры, все типы реакций или SDK следующего релиза.

## Окончательный кандидат после проверки пробелов

`diff --check` обнаружил trailing whitespace в строке field renderer. Убрана только эта конечная пустота; готовый HTML пересобран в `final-clean` с указанными выше окончательными SHA/cache, предыдущий `final` сохранён. На `final-clean` повторены actual HTML жесты по1/1 Chromium/WebKit и local PWA activation/offline — PASS. Повторная сверка SHA8/ZIP3/source250/14 pack objects/public4 files и финальный source drift0 выполнены. Старые журналы `chromium.log`, `webkit.log`, `local-pwa` и `public-check.json` относятся к предыдущему кандидату. Актуальные: `clean-chromium.log`, `clean-webkit.log`, `clean-chromium/`, `clean-webkit/`, `clean-local-pwa/`, `public-check-clean.json`, `clean-manifest.json`, `source-state-clean.json`, `source-drift-clean.json`, `funnel-after-clean.txt`. Внешний browser startup окончательного whitespace-кандидата повторно не запускался: предыдущий внешний запуск неуспешен, внешний gate остаётся открытым, успех по нему не заявляется.

## Внешний PWA запуск подтверждён: изоляция библиотек

Последующая проверка окончательного `final-clean` через публичный root HTTPS прошла в системном Chromium с неизменной TLS-проверкой. В окружении только нового тестового процесса удалены `LD_LIBRARY_PATH` и `PLAYWRIGHT_MODULE` (а также прежние proxy env); использован тот же existing runner и те же выбранные `pwa-ready,pwa-offline`. Ранее `webkit.env` добавлял каталог библиотек WebKit в `LD_LIBRARY_PATH`, в том числе для Chromium. Успех после изоляции — наблюдение, а не доказанная корневая причина прежнего CERT_VERIFIER_CHANGED: отдельное воспроизводимое A/B не выполнялось и ради него удачный smoke не повторялся.

`live-system-libs/chromium-report.json`: service worker activated, ожидаемые cache/buildIdentity `playroom-pwa-v0.21.0-preview.1-75f484c03e3c2caf`, 15 игр, downloadProtocol1 и PushManager. Offline reload, холодная новая страница, Domino, сохранённая партия и профиль PASS. Все 6 геометрических состояний 390×844/844×390 без overflow; errors[], nativeSupabaseRequests0, source drift[]. Две ошибки ERR_INTERNET_DISCONNECTED относятся к каталогу во время намеренного offline; static `/api/packs/catalog` по-прежнему возвращает 404 и не является защищённым сервером каталога. Фактическая доставка Push не проверялась наличием PushManager.

`clean-manifest.json` теперь published/externalPwaVerified true, последняя сверка frozen runtime/locales/tests/packSources — drift0. Прежние внешние неудачи не заменены и не удалены. Рабочие службы, системные библиотеки, VPN/прокси и доверие сертификатам не изменялись. Независимый CUA-browser недоступен (inventory пуст); это не засчитано как проверка браузером. Внешний gate текущего кандидата закрыт в указанном Chromium scope; общая GOAL/реальные устройства/AT/слышимость/независимая usability остаются открытыми.
