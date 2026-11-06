# Обновление регионов без повторного разбора каркаса — 4 ноября 2026

Статус: реализовано, проверено и опубликовано во временном превью. Полная GOAL0.21 остаётся открытой.

## Изменение

Прежний региональный путь сохранял неизменённые колонки, но каждый вызов GameScreen.update всё равно выполнял template.innerHTML для всего внешнего каркаса. Новый адресный RED показал3разбора каркаса на начальный показ, идентичный повтор и изменение только регионаB вместо1.

В app/game-screen.js добавлен быстрый путь для неизменного внешнего markup. При прежних geometry identity/viewport, том же наборе чистых регионов и существующем DOM разбираются только изменившиеся региональные строки. Соседние authored roots переносятся в следующий baseline без глубокого клонирования; существующий DOM.patchChildren получает прежние ссылки и пропускает незатронутые поддеревья. Группировка по непосредственному родителю сохраняет соседей и порядок. Весь набор проверяется до переноса authored roots.

Повторный разбор каркаса остаётся при изменении его строки, владельца геометрии/viewport, набора регионов, потере узла/контейнера или необходимости подготовки player-panel/руки/actions/public sequence. Это требуемые границы корректности, а не объявление всех сцен мигрированными. Объекты кэша ограничены текущим host через WeakMap, старые зрители не разделяют глобальный кэш HTML. Служебный data-playroom-fragment связывает live root с авторским регионом.

Это убирает **HTML-разбор и обход неизменного внешнего каркаса в подходящих региональных обновлениях**. Построение recipe/строки, расчёт зависимостей всех колонок, изменение самого каркаса при счётчике и немигрированные игры по-прежнему требуют дальнейшей работы. Полный запрет повторного построения всей сцены этим не объявлен выполненным.

## Проверки

- `scene fragment patches parse only changed regions and retain live input scroll and effects`: до исправления RED expected1/actual3 по skeleton parse; после Chromium1/1 PASS и WebKit1/1 PASS. Начальный каркас разбирается1раз, идентичное обновление и изменениеB не разбирают его повторно. ТолькоB заново разбирает региональную строку. УA сохранены exact node/input, focus, draft, caret2–5, scrollTop17, runtime style и pausedWAAPI23.
- В том же сценарии сохранены строгие проверки восстановления отсутствующих региона/контейнера, отсутствия placeholders, сброса при новом geometry owner и повторной подготовки player-panel. Их не заменяли проверкой скорости.
- `ordinary game patches measure only affected regions and retire private geometry across audiences`: Chromium1/1 PASS, обычный путь без fragments и audience boundaries сохранены.
- Окончательный HTML: default solitaire rules case Chromium1/1 PASS, реальные Spider/Klondike select/move/draw/undo/collect/recycle/hint и прогресс. Это scope seed17/валидированных позиций и instant animation, не полный матч.
- Окончательный HTML: `screen:phone cached solitaire columns keep applied skins through subsequent commands` WebKit1/1 PASS, обе игры.
- Окончательный HTML: `screen:phone native horizontal scrolling reveals a guided target without dragging or committing` Chromium1/1 PASS. Настоящий CDP touch-pan не создаёт ход, последующий touchscreen tap создаёт один ход. Первый запуск ошибочно задал PLAYROOM_TEST_ARTIFACT вместо PLAYROOM_SOLITAIRE_ARTIFACT и не загрузил документ; этот FAIL не считается проверкой кандидата. Адресный повтор с правильным аргументом прошёл. Отдельный JSON native-метрик не сохранён: ошибочно использовано имя output-переменной; журнал и утверждения исполняемого теста сохранены, новых измерений сверх них не заявлено.
- git diff --check для итоговых runtime/test/doc изменений: exit0. Build8SHA256/3ZIP CRC/source247файлов совпали. Runtime изменён только app/game-screen.js;229остальных файлов, canonical locales, pack sources и installed companion прежние.

## Диагностика и отклонённый эксперимент

В начале итерации существующий clean-replay повторён на прежнем опубликованном dfb95f HTML: Spider740×390,normal340ms,soundoff,1×CPU,Chromium156. Одна разрешённая команда move0→1, busyfalse, placeholders0, errors[]. Длинная задача90мс; click EventDispatch около81.76мс. Разобраны2колонки/11карт и внешний skeleton. Seed в этой записи случайный, сравнение со старым профилем не является контролируемым before/after. Повторного профиля финального кандидата не делали; улучшение общего INP/FPS или исчезновение90мс **не доказано**.

По CPU-пробе повторно проверялась гипотеза сокращения HTML box/flex/grid style reads у SVG-графики при motion clone. Новый тест воспроизвёл эти чтения; эксперимент проходил motion20/20 Chromium и20/20 WebKit. Затем сверка с [DEFERRED-STOCK-1104.md](DEFERRED-STOCK-1104.md) выявила уже отклонённую прежнюю попытку: заметного выигрыша не было, pixel parity неполная. Повторный эксперимент снят; core/motion.js и tests/motion-effects.test.cjs восстановлены точно до опубликованных SHA. В кандидат не вошёл SVG-фильтр, уменьшение обводок или изменение анимаций.

Подход к выбору работы сверялся с [web.dev: область и сложность расчёта стилей](https://web.dev/articles/reduce-the-scope-and-complexity-of-style-calculations); различие SVG и HTML-контекстов — с [SVG2 Rendering Model](https://www.w3.org/TR/SVG2/render.html). Эти источники не заменяют измерение нашего приложения и не доказывают ускорение.

## Публикация

HTML SHA256 `47c80bcc1a4be6133cbc781f5bb43edf1274f08ddd824a70f6122e34bcb54afc`.

PWA cache `playroom-pwa-v0.21.0-preview.1-620266048c7ea11d`; companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`,15игр. Разрешённые временные Funnel443/8443/standalone обновлены; четыре публичных файла побайтно совпали, standalone загружен64KiB ranges с206/Content-Range/length.

Live Chromium: worker activated, ожидаемые cache/buildIdentity,downloadProtocol1,15игр,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Static Funnel по-прежнему не предоставляет `/api/packs/catalog`; эти404/offline failures записаны отдельно, встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Материалы](../../../tmp_files/ux-021/render-cost-1104/): clean-replay.cjs, clean-result.json/trace/CPU, skeleton-red/chromium/webkit.log, ordinary.log, learning-chromium.log/json, skin-webkit.log, native-scroll-final.log, source-state.json, final-manifest.json, own-changes.patch, public-check.json, funnel-before/after.txt и live-pwa/chromium-report.json.

## Продолжение

Остаются внешнее построение recipe, явные dirty dependencies, миграция остальных сцен, остаточная задержка, вся функциональная матрица игр/ролей/сетей/звук/обучение и полная A01–A36 приёмка, физические устройства, AT и независимая usability. Этот шаг не сужает исходную цель до пасьянсов и не переносит её незавершённые требования в следующий SDK-релиз.
