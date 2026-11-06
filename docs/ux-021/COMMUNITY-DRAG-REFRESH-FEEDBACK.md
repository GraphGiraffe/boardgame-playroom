# Друзья: видимое перетаскивание и обновление без сдвига

Два дефекта воспроизведены в существующих `community quick actions` и
`community ownership` browser cases: **Chromium 2/2 RED**. Первый переносил
карточку только при отпускании pointer и уменьшал opacity исходной строки;
ни native drag image, ни pointer preview не создавался. Второй добавлял
`Обновляем список…` в отдельный status перед списком и включал loading в
markup signature, сдвигая содержимое и повторно патча весь список.

`app/community-order-ui.js` теперь создаёт общий pointer preview для мыши и
touch: видимая копия карточки следует указателю в пределах viewport. Копия
fixed/inert/aria-hidden/pointer-events:none, без дублирующихся action IDs и
data-команд; она не участвует в hit-testing, drop или сохранении. Исходная
строка остаётся полупрозрачной. Один pointer ID владеет переносом. Drop
сохраняет штатный порядок, Escape/cancel/lost capture/hidden page/owner
suspension/disposal убирают preview без перестановки. Слой standalone modal
вычисляется по реальному owner, как у существующих avatar bubbles.

В `app/community-ui.js` loading при уже известном списке меняет только
aria-busy/disabled и подпись существующей строки обновления. Loading больше
не входит в signature такого списка и не создаёт строку над карточками.
Первоначальная загрузка без данных по-прежнему объяснена отдельным статусом;
существующая пустая переписка не исчезает во время обновления. Ошибки и явные
уведомления сохраняют свой status/retry. Геометрия, layout/scroll policy и
права операций не менялись. В `app/social.css` добавлен только scoped ghost.

Финальные два existing cases: **Chromium 2/2 PASS, WebKit 2/2 PASS**. Проверены
actual desktop mouse drag при 1280×960, видимость/движение preview/drop, Escape
без commit; controlled touch PointerEvent drag/cancel использует тот же путь.
Это не physical touchscreen certification. Held refresh сохраняет точные
native list/card/input nodes, текст, выделение, фокус, page scroll и расстояние
от поля поиска до списка; aria-busy остаётся true до завершения.

Логи: `tmp_files/ux-021/community-feedback-{red,green}-chromium.log`,
`community-feedback-green-webkit.log`; PNG preview:
`tmp_files/ux-021/community-order-ghost-{chromium,webkit}.png`.
Runtime не публиковался, реальные облачные данные не менялись.
