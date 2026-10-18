# UI API 2 · ХОД 0.18

Пак регистрирует `PlayroomViews.register(id, render, cover, options)`. render получает разрешённые state/viewer/actions/ui и возвращает **элементы сцены**, не собственную оболочку. Эталоны: tictactoe/view.js (поле), gofish/view.js (руки/таблица), yatzy/view.js (таблица), ludo/view.js (маршруты).

Приложение владеет header/status, игроками, рукой, actions, history, modal root. Пак возвращает field/hand/actions и policy компоновки: family, fieldSizing, fieldAspect, layout.focus, anchors. `family:board, fieldSizing:fit` сохраняет полноценное поле заданных пропорций; default aspect — квадрат. Маленький стол/карточные элементы могут занимать меньше места. Паки не переопределяют `.layout-*` глобальным CSS и не добавляют подписи, меняющие размер сцены.

## Ввод

```js
const H = TabletopUI.helpers;
const source = H.source(card.id, actions, ui.selected, {
  key:'card', mode:ui.quickPlay ? 'immediate' : 'select',
  preview:true, inspect:true, drag:true, swipe:true
});
const attrs = H.actionAttr(command); // fixed layout remains the default
const target = H.boardTarget(command, {kind:'move', color:'#3e9168'});
```

Используйте H.target, H.hand, H.actionGroups, H.icon и стабильные data-entity для общей обработки. data-view-key/data-view-preference меняют только представление. DOM атрибут не выдаёт право хода: после ввода authority сверяет разрешённую команду.

Внешняя геометрия фиксируется на партию/viewer/surface/размер окна. Единственное разрешение динамической геометрии на действии — `H.actionAttr(command,{allowLayoutChange:true})`. Input передаёт context; после успешного commit вызывается `GameScreen.allowLayoutChange(host,context)`. Флаг не входит в domain/сохранение/сетевой protocol, не задаётся для всего пака. По умолчанию игровые действия не используют его. Изменение масштаба — явное изменение предпочтения, создающее новую геометрию.

## Компоненты и слои

- Avatar: квадратный artboard, единые пропорции скругления, цвета участников не повторяются. Уменьшается весь компонент; hit area может быть больше изображения.
- Participant: роль/имя, смысловые метрики, first-player/team badge. Отложенные значки — одна строка со scroll, без роста высоты.
- Hand: overlap с ограниченным шагом, скролл даже с недоступной карты. Мини-руки выровнены влево и обрезаны по высоте во всех рассадках.
- BoardTarget: обычная цель золотая, благоприятная зелёная, опасная красная, специальная сохраняет свой усиленный цвет. Иконку клетки цель не перекрывает.
- Board: клетки → интерактивные цели/иконки → маршруты змей/лестниц → фишки. Важное поле не сжимается от появления текста/кнопки.
- ActionReveal: card/cards/dice, копия не содержит действий; слой ниже dialog/popover. Карточные наборы используют лица без двойных белых подложек.
- CardChoiceDialog: выбор закрытой карты относительно viewport, крупные карты, доступное закрытие.
- FieldHelp: единый popover поверх формы, не занимает место внутри строки.
- MiniCard: asset-pack mini-cards; ранг сверху слева, одинаковое перекрытие включая 10, соразмерные толщина/тень.

Рассадка anchors/row — preference устройства, не команда игры. На тесном экране возможен row fallback без перезаписи предпочтения. Порядок по углам читается по периметру; смена направления UNO не переставляет панели. Рыба/Ятзи используют ряд. `layoutRect` переводит экранные размеры в локальные px при масштабе; жесты остаются в координатах viewport.

Проверка: портрет 320/390, короткий landscape, оба режима руки, максимальный roster/счётчики, длинная рука, сеть/Стол/history. Сравнивать геометрию до/после действия; отсутствие ошибок console не подтверждает устойчивость сцены.
