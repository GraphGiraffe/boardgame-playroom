# Пексесо: регионы публичных клеток, 4 ноября 2026

Статус: опубликовано разрешённое временное превью; цель0.21 не завершена. Предварительная source-проверка ниже сохранена как история; окончательный состав и live-результат — в конце отчёта.

Пексесо0.3.5-preview.4, коллекция0.8.9-preview.10. Каждая клетка имеет отдельный регион с зависимостями от разрешённого содержимого, команды, признака совпадения, фазы закрытия и набора ассетов. Ключ `slot-N` обозначает публичную позицию поля, не устойчивую личность скрытой карты. Перестановка невидимых карт не меняет HTML и не вызывает построение рисунков.

Source regression: повторное построение исходного поля16→0, один flip строит1клетку; проверены cartoon/52, скрытая перестановка, несовпадение во время и после закрытия, следующая открываемая карта, совпавшая пара, viewer/Table/player/actions[]. Cached/plain HTML совпадают. Исходный RED:16≠0 (`pexeso-regions-red-1104.log`). Case/views после исправления28/28PASS.

Настоящий браузерный сценарий `Pexeso retained slots flip and close mismatches without replacing untouched public positions`: по1/1 Chromium/WebKit, внутри обе колоды. Команды проходят Session/Authority/Protocol; ожидается реальное появление/завершение flip-motion, затем закрытая несовпавшая пара и отсутствие команд предыдущего игрока. Все исходные корни клеток сохраняются. Проверка сначала воспроизвела их замену при смене authored/presentation-пути. Explicit data-dom-key публичной позиции теперь приоритетнее регионального ключа; обычный регион без явного ключа сохраняет прежнюю идентичность. Региональная метка сама по себе не заменяет физическую идентичность компонента.

После исправления первичного retention новая проверка обнаружила неоднозначный substring-селектор index1, совпадавший с10–15. Исправлен точный селектор публичной позиции `data-motion-value`; ограничение не ослаблено. Итоговые логи: `tmp_files/ux-021/pexeso-regions-final-0-chromium-1104.log`, `...final-1-webkit...`, `...final-2-chromium...` (views28/28). Generic `scene fragment patches parse only changed regions and retain live input scroll and effects` — по1/1, final3/4; в том числе разная смена тегов двух регионов не переносит события и фокус между ними. Точные хеши — `tmp_files/ux-021/pexeso-regions-1104/verified-inputs.json`. Exact companion подготовлен штатным --prepare-dev.

Это source browser fixtures; готовый HTML, offline и публикация ещё не проверены. Реальная слышимость и физические устройства не проверены. Число построений не доказывает ускорение кадра; внешнее построение scene recipe и остальные игры остаются отдельной работой. Устойчивость внутреннего SVG каждого неизменённого слота на всех промежуточных кадрах не заявляется: браузерный regression проверяет корни клеток, а счётчик artwork относится к source renderer.

## Сохранение SVG и окончательная приёмка

Усиленный browser regression показал замену SVG даже при сохранённых корнях клеток: временная блокировка меняла стандартную карту из button в span. В Пексесо characterCard теперь сохраняет button и использует disabled/aria-disabled; он не допускает недоступную команду. Для cartoon и52 проверено сохранение каждого незатронутого SVG через первый flip и показ/закрытие несовпадения, включая промежуточные permission changes. Историческое ограничение предыдущего этапа по SVG выше этим адресным evidence уточнено; все иные сцены/игры не считаются проверенными.

Исходные неуспешные проверки — chromium-svg/webkit-svg, svg-diagnostic и первые artifact-логи. Окончательные source `chromium-svg-retained.log`, `webkit-svg-retained.log`: по1/1; `views-retained.log`:28/28. Все находятся в tmp_files/ux-021/pexeso-regions-1104.

Готовый HTML проверен новым именованным случаем существующего case/rc2-games-browser: `Pexeso resumes every board size and flips only the selected slot through the real application`. В каждом движке выполняются6сочетаний: cartoon/52 × easy/medium/hard. Партия восстанавливается через Мои партии, выполняется настоящий tap, ожидается flip-motion и его завершение; move=1, нужное количество закрытых карт, неизменные корни и SVG остальных позиций, отсутствие горизонтального overflow/page errors/native Supabase requests. Реальный response SHA совпал с проверенным HTML. По1/1 Chromium/WebKit,12состояний; это не12отдельных test cases. Отчёты/скриншоты/engine versions — chromium-artifact-retained/ и webkit-artifact-retained/. Просмотрен cartoon-hard-390.png WebKit:36карт, открытый персонаж, участники и статус видимы, поле помещается.

## Опубликованный кандидат

Итоговая папка final-retained: HTML SHA256 `381e85b62c3e64060403089b5667275148a9b0371c09245b32aa2275b4d0809e`, cache `playroom-pwa-v0.21.0-preview.1-80ffaca7363e1300`. Пексесо0.3.5-preview.4, коллекция0.8.9-preview.10. Проверены8SHA/CRC3ZIP/sourceZIP252файла; остальные14встроенных pack-объектов идентичны Ятзи-кандидату. Runtime230отличается только platform/web/dom.js. После публикации source drift0; подробности в source-state.json/artifact-audit.json/final-manifest.json.

Публичные `/`,8443,`/sw.js`,`/hod-021.html` совпали с локальными bytes4/4. Первый live Chromium остановился до bootstrap: ERR_CERT_VERIFIER_CHANGED при загрузке скриптов, ошибок JS не зарегистрировано; этот запуск не считается успешным. Новый процесс без изменения служб/сертификатной проверки прошёл existing live-runner:6состояний, новый worker/cache, offline Domino/сохранённая партия/профиль, failures/errors пусты и nativeSupabaseRequests=0. Причина сертификатного сбоя не установлена; первичный лог/снимок сохранены отдельно от live-pwa-retry. Offline-проверка не является полным прохождением Пексесо без сети.

Stable/SQL/R2 не публиковались. Реальные устройства/слышимость/внешние сети/AT/usability, остальные игровые реализации и общий scene recipe/latency остаются открытыми.
