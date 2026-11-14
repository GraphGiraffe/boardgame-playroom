# Игровое перетаскивание: native проверка и fixed origin

Причина сообщения «Пропали драг-энд-дроп» на физическом телефоне **не воспроизведена**. Найдена и исправлена отдельная доказанная ошибка положения игрового призрака на ПК. Runtime заморожен; сборку и публикацию выполняет root.

## Проверка сообщения с телефона

Дополнительный просмотр исходной записи `Screen_Recording_20261103_012321_Chrome.mp4`:
после нескольких попыток примерно на 7-й секунде видна постановка 5–3,
затем ход соперника 3–2. Запись подтверждает успешный ход в конце, но не
показывает достаточно данных о каждом раннем жесте, чтобы установить причину
несработавших попыток. Это не подтверждение исправления телефона и не основание
закрывать исходное замечание. Контактный лист: `/tmp/hod-latest-video.jpg`
(временный материал просмотра, исходное видео сохранено во вложении).

Начали с Домино, соответствующего видео владельца, а не с каталога. Один существующий actualRTC case дополнен native CDP Touch Events и настоящими mouse gestures. Проверяются visible ghost, реальный rendered legal target, авторитетное изменение revision/move и цепочки, удаление костяшки из руки, cleanup ghost, затем естественные bot→self turn и завершение action presentation. Fake PointerEvent не использован вместо touch proof.

| Проверяемые байты | Локальная партия | RTC-партия | Результат |
|---|---|---|---|
| Source до fix | native touch hold | native short vertical drag |1/1 PASS, exit0|
| Точная обслуживаемая PWA | native short vertical drag | native touch hold |1/1 PASS, exit0|
| Source после fix | native touch hold | native short vertical drag |1/1 PASS, exit0|
| WebKit после fix | native mouse hold | native short mouse drag |1/1 PASS, exit0|

Точная старая PWA: `tmp_files/ux-021/phone-review-1103/final/pwa`. Standalone SHA256: `11d181742471cdac0050f1e5ce5ee583ada98ecb43ae218af7dc1130615be739`. В ней и source до изменения `core/input.js` байт-в-байт одинаков: `f14223fdec185c256dfadd464d5519a381a8ceb9b423fdeb96b19220fdfb99f8`.

Проверка относится к изолированным новым browser profiles и этим байтам; она не воспроизводит физический телефон и его существующий SW/storage. Родительский агент уточняет конкретный жест пользователя. Не выдаём приведённый ниже desktop fix за найденную причину phone missing DnD.

## Отдельный RED: смещённый ghost на ПК

Existing UNO card-SDK case обнаружил смещение10px при native classic scrollbar gutter: target centre647.1875px, ghost centre657.1875px. `paint` назначал transformX617.188px, однако actual bounding box начинался в627.1875px. Pointer и target используют viewport coordinates, а fixed ghost отсчитывался от containing-block origin с собственным gutter. Это был реальный geometry RED, а не отсутствие ghost или неготовая action animation.

Fix в `core/input.js`:

- перед lift обнуляем старый transform клонированного элемента;
- один раз измеряем фактический fixed origin после append, до straightening animation;
- в `paint` переводим viewport coordinates в этот origin простым вычитанием сохранённых чисел.

Нет магического10px, browser/game ветвей, нового store, дополнительных per-move layout reads или изменения action routing/legal targets. На overlay-scrollbar телефоне измеренный origin нулевой. Жизненный цикл cancel, suppression, native capture и cleanup сохранён.

## Другой SDK hand и сохранённые проверки

`UNO desktop and touch drag/drop through the real application`:13/13 PASS (12 subtests плюс parent), exit0. Исходная2px точность snap не ослаблена. Сохранены mouse/touch, arc hands и обе ориентации, короткий жест, удержание, wild→выбор цвета→один commit, отмена, обычный tap/select, длинная прокручиваемая рука и отсутствие viewport overflow.

Для существующей UNO fixture обновлены только устаревшие входы: local profile и Saved card→action menu→Continue вместо удалённого resume-banner; tutorial отключён для input fixture; состояние читается из canonical текущей save library вместо уже мигрированного/удалённого legacy localStorage key. Правила и проверки ходов не менялись. Первые ошибки старой fixture не считаются product regressions.

Во всех actualRTC reports nativeSupabaseRequests=0, errors=[]. Продуктовые изменения ограничены `core/input.js`; `app.js`, GameScreen.render и pack rules/assets не затронуты. Ни all15 geometry, ни backend suite повторно не запускались.

Артефакты: `tmp_files/ux-021/native-game-drag/final-manifest.json`, RED/green UNO logs, current/served/native RTC reports и lift PNG. Manifest фиксирует source/served hashes, точные команды и ограничения. Последняя собственная source SHA256 input: `f43c042e71afef671bb20d4e83f2be33d8dc59366ac5a4612837e6f2b6664339`.
