# Точечные регионы клеток шашек — 4 ноября 2026

Статус: реализовано, проверено и опубликовано во временном превью. Полная GOAL0.21 остаётся открытой.

## Изменение и версии

Новый source-case воспроизвёл повторное построение рисунков24шашек при полностью неизменном повторном render. Представление Checkers теперь использует существующий необязательный ui.region для64самостоятельных клеток. Геометрия, правила, CSS и семантика ввода не менялись. Без region-порта renderer возвращает прежнюю полную разметку.

Зависимости клетки включают физическую фишку/владельца/дамку, source/target attrs, классы, текущий выбор, ориентацию, доступность/взятие, подсказку, локализованный label и индикацию длинного хода дамки. checkerArt вызывается внутри build региона. Общий registry по-прежнему владеет ограниченным кэшем, сбрасывает его при смене viewer/audience/version/appearance resolver и не передаёт authority owner паку.

Новая версия шашек0.5.5-preview.4, коллекции0.8.9-preview.5. App230runtime-файлов и shared-компоненты прежние. Точное сравнение15готовых pack-объектов до/после показало: изменился только Checkers, остальные14побайтно идентичны в JSON-представлении. Подготовлен новый companion `0f4c38bddb03ccdc0bd32d780ea378322f8b403bd7255b452ce82b73cbf86604`. Старые временные артефакты сохранены; stable/R2 assets не перепубликовывались.

## Проверки

- `checkers regions retain untouched art and exact legal markup across selection moves and audiences`: RED24SVG вместо0 при повторном неизменном показе. После исправления PASS: повторный показ0; выбор и обычный ход перестраивают меньше всех фишек; cached и stateless HTML совпадают полностью. Проверены смена viewer, публичный Table, пустые actions и64независимых fragment ID.
- Весь выбранный `case/views`:23/23 PASS. Остальные игровые представления не заменялись заглушками.
- На точном итоговом HTML весь `case/checkers-drag`: Chromium12/12 PASS, skipped0; WebKit5/12 PASS,7пропущены как неподдерживаемые CDP-touch сценарии. Это11дочерних сценариев плюс родительский test; в WebKit4реальных дочерних сценария, не12пройденных.
- Настоящие mouse/touch input покрывают допустимые фишки/цели, диагональный перенос, click/hold, недопустимую светлую клетку, Escape/cancel, viewer0/1, обязательное и цепное взятие, разблокировку после движения и совпадение фишки с местом назначения при анимации. Прежние строгие проверки числа ходов, ошибок и overflow сохранены.
- В Chromium дополнительно проверены тонкие непрозрачные обводки в light/dark и390×844,844×390,768×1024,1024×768. Просмотрен dark390×844 screenshot. У Checkers максимум2игрока; искусственный8-player сценарий не создавался.
- У каждого непропущенного браузерного сценария errors[],nativeSupabaseRequests0 и SHA фактически полученного документа. Fixture задаёт валидированные сохранённые позиции; это не полный матч со всеми вариантами, remote multiplayer или физический телефон.

Существующий drag-case поддерживал только source/URL и старые входы «Мои партии»/modal resume. Добавлены явный artifact path с SHA-проверкой и текущие root/inline-card селекторы. Остальная логика теста и assertions сохранены. Source ZIP обновлён после правки теста; runtime HTML остался побайтно тем же, повторные source-only сборки не выдаются за новые игровые проверки.

При подготовке baseline была ошибочно предпринята попытка извлечь generated installed-packs.js из source ZIP, где его намеренно нет. Вместо этого использован точный ранее опубликованный PWA-модуль installed-packs.1e77cfeef4ab3142.js; сравнение всех15объектов выполнено успешно. Неудачная попытка не засчитана как проверка архива.

## Сборка и публикация

HTML SHA256 `95dfa8d5c81e43aa0eacec96dda1d8f9b83a1ce9ef4dd6346ff0141291ce171f`.

Cache `playroom-pwa-v0.21.0-preview.1-338afd4cffef8138`. Build8SHA256/3ZIP CRC/source248runtime-locale-test файлов совпали; canonical Checkers sources и сборочная версия отдельно зафиксированы. git diff --check для затронутых app tests и pack view/manifest/build: exit0.

Разрешённые временные Funnel443/8443 и `/hod-021.html` обновлены. Четыре публичных файла побайтно совпали; standalone проверен полностью64KiB ranges с206/Content-Range/length. Live Chromium: worker activated, ожидаемые cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Static Funnel по-прежнему не предоставляет `/api/packs/catalog`; встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Evidence](../../../tmp_files/ux-021/checkers-regions-1104/): views.log,drag-chromium/webkit.log,drag-*/checkers-*.json,screenshots,pack-comparison.json,before-installed-packs.js,checkers-view.js,checkers-manifest.json,source-state.json,final-manifest.json,source-diff-vs-git.patch,executed-views.test.cjs,executed-drag.test.cjs,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json. Diff-vs-Git показывает состояние относительно ветки, а не отделяет всю предыдущую работу; точное изменение готовых паков доказывает pack-comparison.

## Продолжение

Это следующий шаг миграции регионов после пасьянсов. По-прежнему вычисляются зависимости64клеток и строится внешний recipe; остальные семейства игр ещё не мигрированы. Уменьшение SVG-построений доказано счётчиком, ускорение всего хода/INP/FPS не измерялось. Все варианты дамок/терминальные состояния, физические устройства, реальные сети, полная функциональная/UX A01–A36 приёмка и SDK следующего релиза не объявляются завершёнными.
