# SDK 0.18 · API 3

`tabletop-core.zip` сохраняет структуру `tabletop-core/{core,application,presentation,platform,themes,locales}`. Это нужно для одинаковых относительных CommonJS imports и browser source imports; прежняя плоская раскладка не включала зависимости model registration и scheduler. Версия SDK — 0.18.2. Источники и публикация — [RELEASE-0.18](RELEASE-0.18.md).

## Независимые модули

- core/model-runtime.js: GameModel с immutable Position/ActionChoice/Transition/Projection/Result.
- core/model-values.js и core/events.js: JSON/команды и типизированный журнал; проекция перед presentation.
- core/history.js и core/session-codec.js: staging/revisions и компактные сохранения.
- core/command-processor.js: общий transactional pipeline через порты, без transport/DOM/storage.
- core/journal.js: delta event storage и проверяемое восстановление без браузера.
- application/host-recovery.js: целостность состояния/комнаты/receipts и восстановление через переданные engine/Session.
- application/library.js: библиотека с метаданными в заголовке, storage/engine/Session/ID ports.
- application/appearance.js, presentation/localization.js и presentation/scheduler.js: локальные темы, MessageRef и часы показа через порты.

```js
const {GameModel} = require('./core/model-runtime.js');
const History = require('./core/history.js');
const model = new GameModel(gameDefinition); // определение принадлежит паку
const position = model.create(gameOptions);
const history = new History([{revision:0,position}]);
const next = history.prepare(frame => ({revision:frame.revision + 1,
  position:model.apply(frame.position,actor,command).position}));
// Для сетевого authority сначала записать next и receipt в репозиторий.
history.commit(next);
```

Engine registry/Session facade связывают переносимые определения с кадрами Session. core/ui/input/motion/audio — Web адаптеры, не переносимые правила.

## Метаданные и хранение

Library записывает librarySummary до сериализованной Session одной storage.write операцией. Список читает небольшой заголовок и не восстанавливает историю. Заголовок — индекс для UI; полная проверка кадра, версии и истории выполняется при open. Неподдерживаемые/повреждённые исходные данные сохраняются для явного удаления/экспорта. Индекс не заменяет авторитетное состояние и не используется для игровых прав.

Для новых сетевых записей eventStorage=delta-v1: steps содержат только новые события и eventBase/eventTail, header — eventCursor. Состояние/дельта/receipt/новая revision фиксируются одной IndexedDB transaction. Каждый факт хранится один раз. Восстановление сверяет цепочку cursor и receipts, возвращает короткие хвосты прошлых кадров и полный журнал live кадра. Граница перехода API и сохранения исходных данных описана в [DEVELOPER-DATA](DEVELOPER-DATA.md).

## Общие компоненты

Канонический RoundToken — playroom-paks/shared/components/round-token.js. Host SDK содержит закреплённую generated копию core/component-assets.js и provenance/digest core/component-assets.json. build.py --packs-dir синхронизирует её с выбранным companion source; автономная сборка без companion проверяет закреплённый digest. Оба pack builder встраивают этот же исходник перед view-kit. Не редактировать generated копию вручную.

Один SVG масштабирует диск, ободок, грань и знак вместе. Видимый размер отличается от hit area. Правила малых жетонов/веера/стопки/финиша описаны в shared/assets/README.md паков. После изменения canonical source обновить vendored digest сборкой и проверить actual components во всех контекстах.


## Lifecycle и представление

`model.start(options)` возвращает `{position,events}`, `model.create(options)` — Position. Начальные комплекты/прочие игровые факты сохраняются так же, как факты хода. Runtime продвигает revision после каждого apply. Необязательные Definition.score/observe возвращают очки и разрешённую память бота; наблюдения бота не становятся частью viewer projection.

Каноническая команда содержит только параметры domain. Presentation.choice/action добавляют подсказки и MessageRef отдельно; Protocol.command строит игровую команду по разрешённой проекции, не по списку исключённых UI-полей. PlayerReference связывается с roster перед локализацией, имен в domain нет.


### Независимые реакции

Definition может объявить reactions(Position, actor) с теми же `{command, visibility}`, reactionControl(Position, actor, command), reactionWindows(Position), botReaction(projection, actor, actions, memory). Обычные legalActions/botAction не включают реакции; availableActions/project включают обе группы. public reactions доступны на Столе при отдельном actor. reactionControl возвращает kind/episode/target/independent/ignore; необязательный command нормализует аргументы по правилам игры. Повтор разрешённого старого эпизода — no-op без revision/фактов. reactionWindows описывает owner/revision/humanMs/botMs/fallbackMs; время и тип клиента принадлежат authority.

Presentation.choice может вернуть MessageRef в confirmation/targetPrompt и другие подписи; host форматирует их после projection. Presentation.event может дать notice (title/detail refs, tone), speech, sound и public target. Domain не знает имён участников и DOM. UNO-schema требует явных ситуаций; legacy missing state не восстанавливается скрытым fallback.


### Screen и history application layer

`application/game-screen-controller.js` работает с client port (`snapshot`, `history(index)`, `send(action)`) и presentation callbacks. Он не читает DOM, engine registry, storage, сеть или часы глобального окружения. Контекст viewState имеет scope turn/match; выбранная карта проверяется по разрешённой руке. Ordered queue восстанавливает разрывы через тот же client port; cancel/dispose отсеивают поздние ответы. Synchronous local commits используют общий transition callback lifecycle с инъецированными часами.

`application/history-controller.js` хранит live/frame/index/requested, защищает audience/session/pack/revision и отменяет устаревшие RPC. Маркер создаётся только явным `backfill(from,{origin:'backfill'})`; received/presented/reviewed раздельны. Web адаптеры управляют hotseat gate, focus, layout и локальными preferences. `state.scene` — уже разрешённый SceneModel из pack presentation, доступный будущим клиентам без Web renderer.


### Метрики, команда и результат

SceneModel.players содержит `player` (или id), metrics `{id,kind,value,label,resultUsage}` и необязательный team `{id,label,color}`. kind задаёт points/wins/pieces явно, подпись не влияет на оформление. Host форматирует labels после privacy projection; сохраняются semantic IDs. hand-count имеет отдельный ID. Карточки и результаты используют общую функцию playerContent и не пересчитывают игровой результат в Web renderer. Result.metrics могут объявить `display: 'ranking'` для агрегата, используемого для места, без повторной строки текста. Остальные дополнения показываются только если их ID отсутствует среди видимых счётчиков.

Для лобби manifest.teamLayouts задаёт отображение по выбранному preset: `{seatTeams:['a','b','a','b'],teams:[{id:'a',label:'...',color:'#...'},...]}`. Соответствие мест относится к конкретному паку; общий UI не вычисляет команды остатком от деления. SceneModel.turnOrder при необходимости задаёт публичную последовательность (UNO reverse). Authority пересчитывает сцены после фильтрации actions, поэтому сохранённый/paused кадр не содержит доступных commands.


### Семейства компонентов

PlayroomGameComponents / core/game-components.js — закреплённый shared/components/game-components.js: AssetResolver, artboard main/compact, cardFace, dieArt, checkerArt, dominoFace, boardCells, shipSilhouette, countBadge/scoreBadge, scoreTable и bubbleClass. Это Web rendering; правила его не импортируют. Resolver получает локальные catalog/skins/palette/renderers; отсутствующий вариант возвращает default и missing=true. Значения/ID/hidden/actions не зависят от оформления. Особое лицо карты передаёт trusted main/compact/width/height/variant через то же семейство; HTML не принимается из сетевых команд.

core/shared-assets.json закрепляет JS/CSS, каталог и звуки. build.py синхронизирует явно выбранный companion source и проверяет digest автономно. Редактировать canonical shared, затем пересобрать host. Исходники компонентов включены в shared-assets ZIP; SVG-образцы не являются второй реализацией.

## Границы платформы

`application/rooms`, `client-connection-service`, `host-session-service`, `history-sync-service`, `recovery-coordinator`, `pwa-update-coordinator`, `upgrade-service` принимают порты. Они не создают DOM/IndexedDB/RTC или ambient RNG. `platform/web/identity-store`, `session-store`, `dom`, `pack-loader` — Web реализации. HTML-представление и обработка жестов отделены от GameModel и Session; нативный клиент может заменить их, не перенося Web UI. Trusted `pack-loader` исполняет установленный JS и **не является sandbox**.

## Действие, ход, раунд

Transition содержит `turnEnded:boolean` и при объявленном цикле `roundEnded:boolean`. Каждый пак задаёт границы по своим правилам; сравнение actor/turn не является общей политикой SDK. GameModel хранит JSON `timeline:{turn,starts}`; при `definition.rounds:true` также `round,roundStarts`. `revision` — номер действия. Ни звук, ни анимация, ни hold/selection сами по себе не завершают ход.

Presentation может объявлять `scene.round:{number,limit:null|integer,starts:[revision]}` для своих счётчиков (например, Ятзи). Для cycle-пака это представление берётся из публичного timeline. Числа/границы — публичные семантические данные; локализованные подписи создаются клиентом. Пак с меняющейся очередью может не объявлять раунды (UNO).

Свои окончания, ограничение раундов и пояснения объявляются в manifest `settings` (`key`, `default`, `options`, `help`); reducer реализует их и возвращает окончательный Result. Если есть только один вариант окончания, setting не объявляется. Приложение не содержит switch по game id для конца партии. Общая pure библиотека `shared/domain/end-policy.js` предоставляет применимую к гонкам фиксированную границу круга и порядок финиша; карточные паки используют только подходящие операции.

Каждый preset содержит MessageRef description. JSON каталог пака содержит основные правила и описание режимов; справка UI затем добавляет настройки с индивидуальными пояснениями.

## Переход и публикация

engineApi 3 и network protocol 2 обязательны. API 1/2 не исполняются в новом runtime. Старые данные не переписываются; подтверждение полного обновления отдельно от загрузки, исходные данные можно выгрузить. Опубликованные старые файлы и теги неизменны.

Публикация приложения и коллекции независима; процедура и cutover — [RELEASING](RELEASING.md).

Порядок физических мест не меняется при reverse UNO: `scene.turnOrder` описывает очередь, направление показывается отдельным индикатором. Перестановка карточек при изменении направления сбивала бы жесты и привычные позиции игроков.

## Оповещения публичных действий

Presentation может вернуть `feedback: {kind, player}` для `skip`, `pass`, `discard`, `draw`, `take`, `reverse`. Domain определяет факт по правилам; UI не выводит пропуск из смены turn или отсутствия кнопок. Эти метаданные передаются только после audience projection. `Core.soundCues` выбирает один основной cue на revision, приоритет: finish, skip, penalty, UNO, reverse/capture, discard, pass, take, draw, обычные действия. Явный `sound` задаёт вариант, `sound: null` оставляет событие без звука. Отдельные revisions сохраняют отдельные cues даже при одинаковом id.

Web GameFeedback выделяет карточку skip красным и встряхивает 700 мс, без оверлея и сдвига вёрстки. Reduced motion отключает движение, но сохраняет цвет; история/reconnect/повторный ACK не запускают эффект. При активном звуке действия сигнал своего хода не накладывается. Общие источники — shared/sounds/standard-sounds.json и shared/components/game-components.css репозитория паков.

Встряхивание использует независимое CSS-свойство `translate`: оно не заменяет `transform` рассадки. Боковая карточка и её рука сохраняют поворот и размеры на всех фазах пропуска, включая добор штрафных карт UNO.

## Крупный показ публичных ходов

Presentation opt-in `reveal` передаётся после audience projection. Карта: `{kind:'card', card:<public face>, entity:<destination entity>}`; кубики: `{kind:'dice', title?:MessageRef, dice:[{value,active?:boolean}]}`. У Web view опционален `register(...,{reveal: value=>markup})`: используется тот же renderer/ассеты карты, что на поле. Общий ActionReveal не знает правила или названия игр. Не передавайте скрытые грани/карты в эти метаданные.

GameFeedback ставит reveal в общую очередь, использует длительности GameFlow.effectTimes выбранной скорости и ждёт окончания перелёта карты перед следующим ходом. Источник назначения карты временно скрыт, обычная motion-анимация этой entity не дублируется; при очистке/отмене восстанавливается. Кубики — отдельная крупная копия, оригинал не скрывается и перелёта нет. Reduced motion оставляет статичный показ; ручная перемотка/reconnect/дубликаты ACK его не повторяют; autoplay истории использует общий показ. Команды с копии удалены. Масштабирование равномерное, через существующие векторные компоненты/локальную тему. Если назначения на личном экране нет, карта заканчивает показ без выдуманного перелёта.

| Пак | Крупный показ | Что остаётся обычным и почему |
|---|---|---|
| UNO | Публичная выложенная карта, включая особую | Добор скрыт, заявления/штрафы — свои баблы/сигналы |
| Дурак | Публичная атака/перевод/защита | Добор и взятие не раскрывают дополнительные лица; пас/бито — сигналы |
| Домино | Выложенная публичная костяшка | Добор не раскрывает скрытую кость, вынужденный пас — skip |
| Лудо | Только реально брошенные кубики | Перемещения/взятия видны на поле и имеют обычную анимацию |
| Змеи и лестницы | Брошенный кубик | Маршрут/лестница/змея остаются на поле |
| Ятзи | Только принятое очковое сочетание: название и все пять кубиков | Броски/фиксация без увеличения; учитываемые кубики обычные, остальные .82 и затенены |
| Пексесо | Нет отдельного показа | Открытые карты уже увеличиваются/переворачиваются на поле; повторный слой мешал бы запоминанию |
| Акулина | Публичная сброшенная пара | Передача закрытой карты остаётся рубашкой |
| Рыба | Публичный собранный сет | Передача остаётся рубашкой; вопрос/ответ — игровые баблы |
| Морской бой | Нет | Выстрел виден на поле с минимальной паузой; крупный корабль мог бы раскрыть скрытые клетки |
| Шашки | Нет | Перемещение/взятие уже показаны на поле; второй слой перекрыл бы маршрут |
| Крестики-нолики | Нет | Малое поле и обычное появление знака достаточно наглядны |

`YatzyCategories.participation(dice,key)` — чистый общий расчёт участвующих индексов, согласованный с подсчётом очков. При записи нулевой комбинации все кубики неактивны; при паре из трёх одинаковых участвуют ровно два, а не все три. После принятия события сохраняются реальные финальные значения, даже когда следующий ход уже сбросил rolls.

## Подготовка и интерактивный просмотр истории

Определение модели может объявить чистую функцию `preparing(position): boolean`.
Runtime сохраняет все revisions, но при подготовке удерживает первый игровой ход/раунд;
при переходе к игре `timeline.playStart` и первые `starts`/`roundStarts` указывают на
состояние после расстановки. `timeline.preparing` — публичный признак этапа. Счётчик
revisions не меняет смысл и остаётся индексом durable history. История UI начинается с
`playStart`, не переписывая сохранения и сетевые запросы.

`GameScreenController.context` изолирует состояние просмотра истории от live-состояния.
`preferences(base)` накладывает локальные настройки истории; `setPreference(key,value)`
возвращает true, когда настройка обработана историей и не должна записываться в live
preferences. Навигация истории не выдаёт игровые actions. View-контролы
`data-view-key`/`data-view-preference` остаются доступны независимо от игрового ввода.
Authority передаёт публичную `state.timeline` игроку, зрителю и Столу.

Крупный показ использует видимую геометрию `.layout-field`, фиксированный слой вне
сцены и общую `GameFlow.effectTimes`. Время удержания не включает вход/выход.

Кубики используют отдельное `diceReveal`: 500/800/1100/1500 мс для instant/fast/normal/slow. Время `reveal` и flip карт сохранено. `GameFlow.present(effect, {events})` получает только новые projected events текущего действия; для `kind: 'roll'` и `reveal.kind: 'dice'` ждёт фактического завершения эффекта без дополнительного минимального бюджета карточной анимации. Это одинаково для локальных действий, сети и истории. Обычный переброс Ятзи анимирует кубики на месте; крупный показ возникает при записи комбинации.

Для продолжений `GameFlow.present(effect, {events, before, after})` получает предыдущую и следующую публичную позицию. При одинаковом `timeline.turn` и actor, вне подготовки и завершения партии, он также ждёт только настоящий эффект. Совпадения actor недостаточно: новый ход того же игрока сохраняет обычный бюджет. Цепочка взятий не требует отдельной политики для шашек или других названий игр.

## Проверка старта комнаты

RoomService принимает необязательный синхронный чистый порт `validateStart(room)`: null означает допустимый состав, локализованная строка — причину отказа. Общий `startBlocker(roomId)` используется UI и authority; окончательная проверка повторяется перед стартом. Вызов не сохраняет сессию и не расходует живой RNG. Engine API 3 и View API 2 не меняются. `showLastGame` и `seatingByGame` — локальные настройки; responsive fallback меняет только текущую раскладку, не предпочтение. Публичные индексы партий могут содержать optional firstPlayer/presetId/team/playerIndex для компактных карточек; они не используются для игровых прав.

Общие имена механик и актуальные UI ограничения — [MECHANICS](MECHANICS.md), [GAME-ELEMENTS-API](GAME-ELEMENTS-API.md).
