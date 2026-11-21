# SDK: сохранение механик и представления 0.21

SDK переносит действующие механики, компоненты и оформление приложения 0.21. Унификация API не разрешает менять игровой экран на упрощённый универсальный макет. Эталон — реализация до переноса, а не первая сцена нового renderer. Наличие корректных команд, SVG или успешного прохождения партии не доказывает визуальную совместимость.

## Граница компонентов

Правила и presentation пака исполняются в изолированных средах; host получает разрешённую проекцию, типизированные компоненты, ссылки на ассеты и разрешённые взаимодействия. За готовые карты, кости, фигуры, стопки, source/target, руки и экранные зоны отвечает библиотека SDK. Стандартное оформление этих компонентов следует 0.21. Расширение профиля решает конкретную потребность геометрии и доступно другим пакам с той же потребностью.

Нельзя восстанавливать вид исполнением произвольных view.js/CSS паков в host, передавать presentation полное состояние или добавлять ветвления по ID игры в общие компоненты. Также нельзя скрывать недостающий компонент текстовым ярлыком, кнопкой с именем команды или новым символическим ассетом. Недостающая механика должна получить общий контракт и реализацию, сопоставленные с работающим эталоном.

`scene.family` классифицирует сцену, но не описывает всю компоновку. Оно не заменяет `fieldAspect`, field groups, source/target, резервы рук и действий, геометрию скинов, anchors рассадки и публичные планы. Эти возможности требуют явного переноса. Общие правила размещения описаны в [PACK-SDK-LAYOUT](PACK-SDK-LAYOUT.md), сценарии отказов — в [DEVELOPMENT-REGRESSIONS](DEVELOPMENT-REGRESSIONS.md).

## Каталог обязательных механизмов

Следующая таблица задаёт покрытие совместимости, а не статус готовности.

| Игра | Механики и отображение, которые обязан выразить SDK |
| --- | --- |
| UNO | Исходная печать карт и индексов, скины и рубашки; веер руки; колода/сброс/цвет/направление; выбор и drag карты; явный выбор цвета; UNO/обвинение; предпросмотр следующего игрока и штрафов. |
| Домино | Ориентация костей и обоих концов цепочки, раскладка цепочки, базар, оригинальные руки, открывающая кость, выбор стороны, счётчики и переходы. |
| Дурак | Козырь и остаток колоды, пары атака/защита и слои карт, переводы/подкидывание, взятие/отбой, роли и смена ролей, выбор/drag и колода. |
| Шашки | Исходные клетки/фигуры/дамки, разворот, обязательное взятие и цепочка ходов, source/target/drag, маршруты, сохранение неподвижных фигур. |
| Змеи и лестницы | Исходные лестницы/змеи, особые клетки и иконки, фишки/стартовые места, кости внутри выделенной зоны, поправка результата, маршрут и пошаговое перемещение/обмен. |
| Лудо | Маршрут и базы, рассадка относительно баз, оригинальные фишки, резерв зоны кубиков, выбор фишки/кости/цели, повторный бросок, несколько фишек на клетке. |
| Мемори | Все существующие колоды и скины, неизменная сетка, закрытые карты без утечки личности, открытие/закрытие пары, найденные пары, тема и размеры. |
| Морской бой | Два поля и координаты, исходные корабли и индикаторы, расстановка/поворот/drag, готовность, ограниченная видимость, выстрелы/попадания/потопление, разворот и рассадка. |
| Ятцы | Исходные кости и зоны удержания, бросок/выбор/возврат, таблица категорий/очков и предпросмотры результата, подсказки, счётчики и действия. |
| Старая дева | Руки и исходная печать карт/рубашек, допустимый выбор карты противника без утечки ID, сброшенные пары, порядок игроков и анимация передачи. |
| Рыбалка | Мини-карты, числовые ранги и собранные наборы, запрос ранга/адресата, колода, передача карт, руки и счётчики. |
| Косынка | Колода/сброс/дома/колонки в прежних зонах, геометрия скина и перекрытия, drag всей серии, отмена, hints, автоукладка поверх дома, undo, итоговый счёт. |
| Паук | Десять колонок, закрытые/открытые перекрытия, добор, серии, очки/действия, drag серии, hints, undo, сбор серии и итог. |
| Стихийная потасовка | Оригинальные terrain/pawn/card art, квадратные карты и тип действия, одновременный план, здоровье/жизни/команды, возрождение/добыча, reveal/движение/атаки/урон/падения, фазы и памятка. |
| Крестики-нолики | Один квадратный рельефный планшет с внутренними линиями, исходные X/O на фишках, активные клетки, ход/победа, исходные badges и анимация установки. |

История, spectator и live используют те же компоненты, ассеты, геометрию и публичные планы; меняются разрешения на ввод и источник времени. Уход в историю не создаёт второй renderer. Исчезновение руки освобождает содержимое, но сохраняет разрешённый геометрический резерв. Неизменённые узлы, фокус, IME, черновик, scroll и текущий drag сохраняются либо отменяются явно при несовместимости.

## Неподвижная игровая геометрия

Размер поля и основных зон фиксируется при начале сцены. Переизмерение допускается при реальной смене viewport/масштаба, геометрии выбранного скина или явно разрешённом reflow конкретного действия. Изменение счётчика, показ вариантов, меню, результата, голосования и сообщения сами по себе не разрешают перестройку.

Меню цвета/толщины/масштаба и результаты рисования показываются поверх поля. Догадки — временные сообщения поверх холста: вход с разных сторон снизу, движение вверх, время показа 5 секунд; они не участвуют в расчёте tracks. Composer находится в штатной карточке угадывающего и использует оформление чата. Начальный показ слова использует механизм крупного хода, при рисовании слово центрируется над инструментами. Reduced motion сохраняет читаемый показ без полёта; скрытый документ и история не воспроизводят накопившийся поток как новые сообщения.

Логическое пространство рисования — квадрат 1024×1024. CSS-размер и DPR не меняют координаты/толщины в журнале. Нормализованные uint16 координаты и ограничения чанков сохраняются. Все coalesced samples и конечная точка pointerup входят в журнал; predicted events не являются подтверждёнными точками. Рисование coalesced events описано в [MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents). Отрисовка overlay объединяется в rAF, собственные неподтверждённые операции живут до ACK/отказа/смены холста, TTL применяется к удалённому preview.

Hotseat не предлагает голосование. В сетевом голосовании обе кнопки видны до завершения; выбранная получает насыщенный фон и `aria-pressed`. Отсутствие повторной разрешённой команды отключает кнопку, сохраняя её выбранное состояние. Авторизация действий остаётся у правил.

## Сравнение с эталоном

Эталон 0.21 фиксирует существующие механики, материалы и визуальный язык. Известная прежняя проблема — мелкие карты и большое пустующее поле на ПК — не считается регрессией SDK. Согласованное улучшение адаптивного масштаба зон и компонентов ведётся отдельно в ROADMAPler (`sdk-adaptive-scene-scale`): пропорции, логические координаты, доступность и стабильность сцены сохраняются. В сравнении явно отделяются дефекты переноса от таких согласованных изменений эталона.

Для каждого изменённого блока сохраняются exact app/pack SHA, версии и контрольные суммы входов. Сравнение выполняется на одинаковых seed, игроках, настройках, скине и позиции истории; стартовый экран с другим состоянием годится лишь для поиска общей геометрической ошибки. Нельзя принять новый screenshot в качестве baseline только потому, что изменился SDK.

Проверяются старт, характерный ход и выбор, доступные жесты/отмена/undo, переходы и эффекты, история/возврат и смена ориентации. Проверки блоков и вариантов выбираются по конкретной изменённой механике. Итоговая приёмка миграции охватывает все игры из таблицы: телефон portrait/landscape, планшет и ПК, максимальные участники и короткий экран. Ни один кубик, действие или активная цель не должны требовать прокрутки за пределы выделенной игровой зоны.

Сравниваются геометрия, физические размеры, порядок слоёв, печать и скин ассетов, доступность и подсветка, анимации и фактическое действие. Golden screenshot не заменяет проверку журнала, скрытых данных, ввода и восстановления. Автоматическая эмуляция не доказывает физический Android/RTC scope. Задачи и результаты приёмки ведутся в ROADMAPler; эта страница описывает технический контракт.

## Параметры общих компонентов

`scene.cellStyle: 'mark-token'` использует общий рельефный планшет.
`scene.players[].mark` (до восьми символов) отображается на карточке игрока
в партии и в истории. Подтверждённое действие `{type:'place', cell}` запускает
анимацию установки в соответствующей клетке.

`scene.deck: 'color-value'` выбирает исходную печать цветных карт через закреплённый shared renderer и обычную физическую рамку карты; `standard` использует стандартную печать. Выбор задаётся семантикой сцены, без определения игры по ID. Закрытая карта не получает лицо или скрытую личность.

`scene.deck: 'domino'` использует прежнюю физическую костяшку 4:7 и её рубашку. Костяшки руки и компактных рук стоят вертикально; поворот на игровом столе задаётся отдельно. Счётчик `stockCount` в сцене `tile-chain` сообщает размер базара и сам по себе не создаёт изображение карточной колоды.

`family: 'tile-chain'` переносит прежний пятиколоночный маршрут с поворотами. `chain` содержит публичные костяшки в каноническом порядке, `openingTileId` задаёт начальный якорь. Меняется направление изображения, а не порядок массива. `chainPresentation` задаёт локализованные подписи цепочки и краёв; `placements` — разрешённые команды с точными `a`, `b`, `join`, подписью и помощью. Превью выбирается по команде и источнику, не вычисляет допустимость хода в host. Начальная цель и два края резервируют место; длинная цепочка прокручивается внутри фиксированного поля. Общие `foldedChainLayout`/`foldedChainOffset` используются компонентом и host при изменении viewport.

`statusItems` содержит до восьми публичных счётчиков `{label, value}`. Они выводятся в существующий status slot приложения теми же `scene-meta`/`table-chip`, что в API3. Технические имена зон и объектов не становятся интерфейсом игры.

`nextPlayerByCard` и `turnPreviewByCard` описывают предварительный результат выбора доступной карты. В ХОД и просмотрщике SDK следующая очередь и штрафы выделяются на штатных карточках игроков. Отмена выбора восстанавливает обычную подсветку хода. Смена наблюдателя и переход в историю снимают предварительное выделение.

Общий показ хода рисует сыгранную костяшку вертикально с пропорцией 4:7. Поворот на столе принадлежит позиции в цепочке. При прямом переходе в истории используется тот же показ, а костяшка на столе открывается после его завершения.

`interactions[].activation` различает `select`, `immediate` и `preference`: явный выбор/подтверждение, немедленное действие и пользовательскую настройку быстрого хода. Глобальная настройка не отменяет явный `select`. Например, Домино сохраняет выбор костяшки с последующим выбором края даже при включённом быстром ходе. `gestures: {drag, swipe}` ограничивает доступные жесты источника; эти параметры не дают права исполнить команду, которой нет в текущей проекции. Отсутствие свайпа не отменяет нажатие или разрешённый перенос.

`routeStyle: 'cross-and-circle'` переносит исходную геометрию поля с базами: квадрат 15×15, публичные `routeCells`, четыре семантических `boardSides`, базы и якоря. Presentation передаёт положения и названия фишек, тип `base/track/finish`, разрешённые `moves` и их маршруты. Компонент сохраняет исходные материалы, стрелки/безопасные клетки, нумерацию фишек и раскладку групп через общий `TokenLayout`. Хост не рассчитывает дальность или допустимость хода. Дружественная фишка остаётся источником выбора; выбранный ход доступен через клетку либо соответствующий кубик. Начальное действие фишки на базе может иметь явную разрешённую `command`.

Native SDK route profiles use the same Motion surface and GameFlow tempo as the application. Presented event sequences supply exact route steps and jump/departure anchors; the renderer does not infer movement from the final coordinates. Forward history starts a new playback with the same public descriptor and read-only controls. A committed roll animates even when no pawn pose changes; public `lastRolled` flags retain its dice leads after an automatic turn handoff. Reduced motion and navigation retire the PlanPlayer lifetime and restore hidden dice/pawns.

For compound commands, `Presentation.eventScenes(projection)` returns ordered `{eventId, scene}` checkpoints for public events of the current revision. Each checkpoint passes the shared SceneContract and contains no interactions; unbound scenes inside event descriptions are discarded. The installed adapter and isolated SDK runtime use the same validator. The native SDK view uses the application's GameFeedback/EventPlan queue: it releases each checkpoint and captures the next route from that displayed pose. Commands remain gated until the queue settles. History replays the same checkpoints; reduced motion and destroy cancel pending legs and restore the committed endpoint. The studio transfers public frames into the viewer's realm before the common plain-data plan validation.

`dicePlacement: 'actions'|'status'|'field'` задаёт штатный порт кубиков; `diceStyle: 'flat'|'raised'` — прежнюю физическую геометрию. Кубики в панели действий или статусе не участвуют в размерах поля, имеют собственный управляемый subtree и используют закреплённый skin/packId. Команды с источником включаются после выбора этого источника. Удержание/использование меняют состояние и классы без перестройки неизменённой грани. Локальные и сетевые делегаты приложения пропускают SDK-порты, чтобы один жест не исполнялся двумя обработчиками.

Корень сцены принадлежит `SceneRenderer` через `PlayroomDOM.manageChildren`. Оболочка может обновлять атрибуты и перемещать контейнер; она не очищает содержимое работающего компонента при переходе в историю. Renderer восстанавливает собственные классы при update, освобождает lease и удаляет свои узлы при destroy. Руки и кубики вне корня имеют отдельные leases. Это один механизм для всех паков: история меняет авторизованную проекцию и права ввода, а не выбирает другой renderer. Общие стили кнопок не должны менять раскладку физического компонента; например, ячейки маршрута используют прежнее растяжение grid-track, сохраняющее видимость процентных точек.

`scene.tableLayout.kind: 'stock-discard'` явно выбирает прежнюю компоновку колоды и сброса. Счётчики приходят из публичной сцены; локализованные подписи и необязательный индикатор цвета/направления — из presentation. SDK сохраняет физические карты, рубашку выбранного скина, угловой счётчик и слои сброса. Цель выбранной карты появляется поверх сброса, не раздвигая стопки. До выбора сброс остаётся зоной переноса; нажатие на него без выбранной карты не выбирает произвольное действие. Быстрый ход, обычный выбор и выбор параметров карты проверяются отдельно.

Руки монтируются в штатные `Hand`/`PlayerPanel` API3, включая веер, перекрытие, мини-карты, открытые руки и пустые зарезервированные ряды. Параметры рассадки, фокуса поля/рук, отдельного представления соло и резерва действий проходят общий `layoutPolicy`. Встроенные SVG-ресурсы поддерживают обе формы payload — base64 и UTF-8; выбор ассета/скина всегда получает контекст текущего пака.

`scene.actionDock` задаёт существующие зоны `start`, `primary`, `end` компонента `ActionGroups`. Каждый элемент содержит локализованную `label` и необязательную разрешённую `command`; отсутствие команды сохраняет выключенную кнопку, например объявление, временно недоступное игроку. Одна команда может иметь и физическую цель на поле, и штатную кнопку в доке. Команда выбранного объекта имеет приоритет перед несвязанными source-free действиями, ссылающимися на ту же общую зону. Миграция не должна удалять прежнюю кнопку только потому, что команда уже доступна на колоде.

`scene.cellStyle: 'mark-token'` задаёт рельефный планшет с внутренними линиями и исходными фишками X/O. `columns`, числовой `rows` и `cells` описывают полный прямоугольник; неполная сетка диагностируется. `fieldAspect` передаёт существующий контракт API3: поле с aspect использует `fit`, а не несовместимый с ним `content`. Добавление фишки обновляет её содержимое, сохраняя размеры клеток и поля.

`menuActions[].kind: 'vote'` отличает предложение голосования от обычного игрового действия. Host скрывает его и vote-уведомление в hotseat; сетевые поверхности сохраняют голосование. Этот presentation-параметр не является разрешением исполнить команду и не заменяет authority.

Переданное host значение `support.tutorial: null` явно отключает SDK-подсказки. Оно не должно заменяться запасным tutorial из проекции гостя. В обычном приложении оформлением обучения владеет штатный FirstTurnGuide; семантические классы SDK лишь привязывают цели и не добавляют второй вид выделения. Компонент очищает только собственные классы.

При подготовке установленного кадра приложение передаёт `tutorial: false` гостевому рендеру. Сценарий обучения загружается отдельно с разрешённой сценой, актуальным выбором и прогрессом зрителя. Studio получает учебные данные в составе своего кадра предпросмотра.

Браузер, Node и Studio берут список доверенных модулей из `sdk/trusted-sources.cjs`. Среда представления загружает валидатор данных, локализацию и поддержку представления. Модель, события, генератор случайных чисел, входы и сложность ботов загружаются в среды правил и ботов. Каждый вызов представления в приложении получает новую гостевую среду.

`motionSequence` передаётся через API3 в штатный аниматор приложения. Управляемый SDK-порт нельзя временно заменять HTML-заготовкой для измерений: она ещё не содержит объектов и якорей. Общий pipeline использует подключённую сцену; публичная фишка, объявленная в board-zone, сохраняет физическую идентичность, даже когда одновременно служит drag-целью. Необъявленные цели, приватные руки и статические шаблоны этим исключением не открываются.

HTML-порт SDK имеет одинаковую структуру в обычном render, feedback-field и истории. Дополнительная region-обёртка здесь не нужна: она меняет дерево при замене field-сцены, создаёт новые фишки до повторной подгонки размеров и вызывает ложные перелёты неподвижных объектов. DOM lease сохраняет уже подогнанные физические компоненты.

`routeStyle: 'numbered-serpentine'` переносит прежний номерной маршрут: чёткую квадратную сетку, исходные лестницы и змеи с белой подложкой, специальные клетки, физические фишки и шесть резервных стартовых мест. `numberedRoute` задаёт локализованные подписи, публичные связи и оформление специальных клеток, активный источник, параметр выбора поправки и сообщение об обмене местами. Положения/номера фишек и разрешённые команды приходят из пака. Общий renderer не вычисляет столкновение, эффект, бросок или разрешённый ход. Поправка — локальный выбор параметра текущей ревизии; она фильтрует точные команды кубика/клетки. Кубики и стартовый док находятся в штатной панели действий. Маршрут/лестница и возврат вытесненной фишки используют общий аниматор, включая доступный якорь нулевой позиции.

В альбомном режиме верхние системные блоки используют окончательные границы боковых зон, а не предварительную оценку ширины колонок. Это относится и к угловой рассадке без рук. Подложка поля/оппонентов/игрока и её обводка строятся из одного измеренного контура; поле не должно оказываться под названием или быстрыми действиями. Обводка — неинтерактивный SVG-порт с отдельным владельцем DOM, поэтому обычный ход сохраняет её. В портрете остаётся обычная граница сцены. Проверять возврат из портрета, несколько игроков и историю; сохранение дефекта из0.21 не считается совместимостью, если владелец отдельно попросил его исправить.

По уточнению владельца альбомный список оппонентов сначала пытается занять один столбец по измеренной суммарной высоте карточек и доступному месту под системной зоной. Два столбца не назначаются только потому, что они помещаются по ширине. В обычной рассадке компактная рука находится справа от аватара/счётчиков и выровнена к правому краю; используются существующие DOM-порты, число и приватность карт не меняются. Если весь состав не помещается по высоте, остаётся читаемый многоколоночный/прокручиваемый вариант. Угловая рассадка сохраняет отдельную геометрию баз. Измерение входит в начальное распределение/поворот viewport; счётчики и выбор карты не перераспределяют поле.

`scoreLayout.kind: 'category-sheet'` переносит прежнюю компактную таблицу категорий: строки `ScoreRow`/`ScoreCell`, заголовки игроков, строки промежуточных сумм после указанной категории и общий итог. Все значения и предпросмотры рассчитывает пак. Host проверяет размеры/числа/ключи и разрешённость каждой команды, выводит заданные значения, сохраняет DOM строк и прокрутку. Ноль — заполненный результат, `null` — ещё не заполненная категория. Кнопка предварительного результата появляется только при наличии точной разрешённой команды; подтверждение остаётся у приложения. Sticky-заголовок, первая колонка и итог работают внутри фиксированного scrollport.

Контекст `SceneRenderer.update` может содержать `participants` — публичные отображаемые данные игроков от host. Они используются штатным `Avatar` для заголовков таблицы и не передаются в VM правил/presentation. При отсутствии этого контекста автономный renderer использует номера игроков. Аватар не перестраивается от изменения счёта. Выбор столбца — локальное состояние UI, не игровая команда.

Пять кубиков таблицы используют прежний плоский профиль и равные уменьшаемые слоты, кнопку броска и публичный статус-порт; на публичной поверхности до первого броска грани пустые. `die.held` владеет `aria-pressed` и нативным selected-состоянием независимо от выбора source/target. Проход подсветки не сбрасывает состояние toggle-компонента. История использует ту же таблицу и кубики, скрывает кнопку броска и отключает запись/удержание; штатный аниматор перебрасывает только не удержанные кубики.

### Paired trick tables and public card reveals

The `paired-tricks` table profile retains a fixed stock footprint and a bounded
set of attack/defence pairs. The pack supplies public cards, translated help,
role badges and exact legal source/destination commands. The host retains empty
slots throughout the bout, uses the original flat pair offsets and stock/trump
print, and removes old card identities when slots become empty. A transfer is a
selected action; a trump exchange remains a named action. Neither is inferred
from ranks by the renderer.

The opening target is the shared card-slot surface. Its disabled state dims the
entire print. The dashed empty defence slot is a separate destination in the
same pair footprint. The standalone viewer uses the application's arc hand
default through the same hand fitter as ordinary play.

Public card events use the shared `PlayroomSDKRenderCard` print port through the
normal application `ActionReveal` lifecycle. A pack can declare its metadata
`deck` (`standard`, `color-value` or `domino`) for those prints. Display identities
and skin resolution remain host-owned; pack HTML/JS/CSS never runs in that port.
The live target is hidden until the enlarged card returns. History mounts the
same pair table read-only and does not leave selected commands in hidden DOM.

### Collected sets, paired discards and opponent choices

The `collected-sets` profile keeps one fixed 36px row per player, native avatars,
a stock and the original shared rank-only mini-card renderer. The pack supplies
numeric ranks and public representative card IDs; shared application messages
print face ranks. The table uses the surrounding surface color, as in 0.21.
Sets belong on the field, never duplicated inside hands.
The normal geometry queue updates only the changed collection subtree, including
responsive columns and safe overlap, without reallocating the game zones.

`discard-pairs` shows the latest public card and authored pair count. An authored
`crown` flag preserves the unpaired queen across card prints and skins. Own-hand
inspection is explicit through `handInspection`; it grants no game command.
Inactive player state uses the same native player panel as the original pack.
A picker-only game with no action reserve does not allocate an empty action row.

`playerChoices` declares `request` or `cards`, the player, exact command and
optional source/card index. SDK source selection drives the existing native
player-target component, including its hidden-card dialog, focus and cancellation.
The dialog copies passive back art, not live buttons or SDK permission attributes.
Names are resolved at the model presentation boundary; commands retain their
original JSON. History uses the same rows/discard ports with input disabled.
This is selected compatibility evidence, not full-game/all-preset/physical acceptance.

### Draughts board

`checkerLayout.kind: 'draughts'` retains the original 8×8 material, 3% frame
inset, coordinates and checker artwork. The isolated presentation supplies cell
labels/help, viewer orientation, physical piece IDs, light/dark sides and exact
legal moves. The host never infers captures, promotion or continuation rules.
Empty-cell help may be empty; accessible cell labels remain required.

Cells reserve explicit grid tracks so a percentage-sized piece stays relative
to its whole cell before the shared physical-size fitter runs. Native pieces
retain their DOM identity through movement; promotion changes only their art.
Captured pieces remain dimmed until the authored chain finishes. Forced source
selection remains visible in history while all live commands are disabled.
The normal application motion and history ports own playback; this profile
does not allocate a second animator or an empty action dock.

### Naval fields

`fleetLayout.kind: 'naval'` provides the original single-board viewport,
segmented ship material, fleet indicators, placement controls and field tabs.
The isolated presentation supplies authorized ship cells, exact placements,
rotation/removal commands and localized labels. A ship's geometry must match
its public scene object; placement sources and cells must match their declared
interactions. Hidden opponent coordinates never become physical IDs or cells.

Shots belong to the attacker, so each board displays the opposite player's
`{cell, hit}` records and automatic miss marks. A hit does not reveal an unknown
ship's geometry. The common input port preserves a dragged segment's offset
and the explicit remove command when a placed ship leaves its board.

Native hosts own manual view state and saved follow-opponent preferences through
their existing view controls. Standalone viewers retain equivalent local state.
Only one page is active; inactive pages are inert and cannot submit commands.
History uses the same cells and ship material with every live target disabled.

### Paired memory cards

`memoryLayout.kind: 'paired-grid'` uses logical slot IDs, shared card material
and the existing host card-grid fitter. `data-card-count` owns the fitted card
width; the rule applies to any such grid instead of a particular game ID.
Slots, the optional centre gap, found-pair opacity and field dimensions remain
stable during reveals, appearance changes and history navigation.

The presentation supplies authorized cards, matched/closing flags and optional
localized face labels. Hidden cards contain only `{hidden:true}`. The host's
presentation-turn port selects the brief public mismatch reveal; native
`data-motion-face`/`data-motion-back` ports perform the same flip/close lifecycle
as 0.21. The final live state renders opaque backs again. History uses the same
retained slots and disables live input.

`skinFamilies` can narrow a scene to a subset of its manifest's families, so a
character deck offers character skins and a standard deck offers card prints.
The public media map returned by `exportView` includes validated isolated-pack
assets. Appearance samples use the actual minimal/simple character resources,
not a substitute host avatar. Character and card-back skin dependencies are
part of the retained print signature; changing appearance needs no game move.

## Native solitaire profile

`scene.solitaireLayout` selects reusable `waste-foundations` or `completed-runs` geometry. The pack supplies public piles, localized labels, canonical suit-to-home slots, authorized hints and ordered public collect transfers. Hidden tableau cards contain only `{hidden: true}`; the stock exposes its count. Every public card ID belongs to the scene object catalogue. Shape validation rejects private hidden-card fields, invalid pile counts, unknown drag sources and malformed transfers; command validation checks hints against the current projection.

The host vendors the canonical `solitaire-board` library and injects trusted card, asset, text and input helpers. It executes neither pack HTML renderers nor pack CSS. Native scrollports, fixed card dimensions, source/target selection, legal stack drag, inspect, stock/recycle, undo, hint popup, home anchors and relocated controls remain shared components. Crossing columns preserves unchanged physical card nodes and artwork. Permissions are rebuilt for each revision and withdrawn in history. Ordered collect flights keep the previous public home top below later arrivals; scene-history rendering uses the same profile and renderer.

Relocated action slots retain one physical owner across shell patches. The shell restores their logical parent before reconciliation and locates them by the permanent `layout-actions` role afterward; a temporary header class is not their identity. The native SDK viewer must retain the same controls, card geometry and artwork after returning from history. Choice menus use an overlay layer and reserve no new field row.

The studio selects motion from projected presentation events through the same transition policy as the application. Native solitaire delegates to the canonical motion surface under the SDK PlanPlayer lifetime: the previous home top stays below ordered arrivals, and intermediate cards come from the public transfer templates. Forward history uses the same descriptor and a fresh playback identity; backward navigation and return to live snap to their checkpoint. History grants no live input. Reduced motion and disposal cancel the shared layer and restore destination visibility.

## Native elemental arena profile

`arenaLayout.kind: 'elemental-grid'` uses the trusted canonical elemental-arena component and shared view-kit. The authored scene supplies terrain, public figure positions, viewer-authorized cards/drafts, precomputed move/attack previews, localizable labels and health/metric descriptors for live and public frame states. The component reuses native cell, figure, health, direction, preview, effect and reveal layers, square hand cards, action switch, rotation, plan confirmation, reset and illustrated memo. It does not calculate game outcomes or read authority state.

`GameScreen.cardHelpMarkup` builds the same illustrated memo/card descriptions for the application and native SDK host from the current authorized DOM. The application keeps its own navigation presenter; the SDK uses the shared ModalController and surface dismissal, including focus restoration. SDK help is retired immediately on viewer/history/pack changes and disposal, releasing inert state and listeners. Pack code receives no DOM or modal capability.

The web adapter binds finite authorized commands separately from local view selections, preserves host-owned hand and participant slots, and retires live permissions in history. Participant articles, decision-player endpoints and pass-device controls remain host-owned; the adapter leases only score, gameplay-badge and arena-status subtrees. The public plan drives the same arena component with explicit frame indices and scheduler-owned CSS animations on both field figures and participant cards. These effects share the exact group duration; unrelated infinite highlights are not rewound. Health indicators have their own nonnegative capacity bounds; terrain/effect kinds are closed enums, and physical card identifiers remain escaped attribute values. Original native layouts remain the visual reference; initial-layout comparisons do not establish complete preset, loot, respawn, network, audio or physical-device acceptance.

Hidden-card choices declare `playerChoices.cardShape` (`portrait` or `square`) and bind only the current viewer’s exact commands to the shared PlayerTarget picker. Recipient changes and history revoke old choices. The picker uses the canonical component stylesheet in both the ordinary app and standalone SDK; loot never adds private card faces or identifiers to the selection dialog.

## Native SDK host view

`TabletopPacks.sceneRecipe` is shared by installed packs and `PlayroomSDKGameView` (`sdk/native-view.js`). The thin studio mounts that component in a same-origin viewport with the application styles, participant panels, hand/dice/control ports, geometry owner and native game menu. Public component labels are formatted through the same text port; raw message records do not reach primitive status indicators. History updates that same view and revokes commands. Author-only checkpoint/debug responses stay outside renderer frames; accidental private envelopes are rejected. Destroy releases the menu, inert state, effects and command listeners.

Atomic native events also use the application's GameFeedback queue for speech, reveals, transfers and audio. The host audio port joins the plan's AbortSignal; NetworkProjection selects the same explicit/fallback cues as local/network play, and pack-owned offline samples register with TabletopAudio. The bounded SDK card renderer supplies public reveal art. Shared sound-asset resolution binds declared samples before the same audio validator; unlisted files cannot become sample URLs. Initial hand cards bind gestures after keyed insertion, when their real hand ancestor exists, so the first swipe needs no unrelated repaint. Continuous canvas commits retain their own ordered gesture queue. Authored arena plans, exhaustive skins and long parties, and physical audio acceptance remain separate checks.

Finished SDK frames carry the validated public result summary from `GameModel.result`. Only ranking fields cross the authority boundary. The native view uses `GameScreen.resultMarkup` and waits for the last public animation before opening it. The terminal sound plays once per live party. Opening results manually and reviewing a finished position are silent. The shared result dialog can open read-only history and start a fresh party through an explicit host restart port.

`actions[].choice.confirmation` opens the shared action sheet for an exact legal
choice, including Yatzy scoring. The viewer discards the sheet when the party,
viewer, history mode or revision changes. Only the current confirmation submits
the authorized command. Forward history plays the recorded reveal from that
command without reopening the choice sheet.

The shared status bar uses the scene's authored round label and limit when
present. The projected timeline supplies the round number for a scene without
its own round descriptor, including when browsing history.

The SDK server gives each party a stable `sessionId`, renewed by start/restore/reload. Native geometry and view state use that identity, while history keeps it. A new party can therefore fit a different card count without reusing the previous grid; ordinary moves still retain their fixed layout. `whenIdle()` includes a pending command acknowledgement and the resulting presentation. The transport uses its presentation-only option to avoid waiting for itself, and navigation can cancel the presentation/audio immediately.

Initial layouts of all 15 packs are compared with frozen 0.21 on identical synthetic positions at three real viewports. These captures establish the initial native host integration only. Gesture/animation/assistance/skin/audio and complete-party acceptance remain separate requirements; historical generic-view tests must be aligned with native components before the SDK gate can be considered complete.
