# SDK: ввод, часы и рисование

Рабочий технический контракт текущей реализации SDK. Это общий интерфейс,
а не отдельный движок Калякодила; пак исполняется только в гостевой VM.

## Детерминированные порты

Definition может предоставлять `inputs(position, actor)` и `advance(position, now)`.
`inputs` возвращает `{command, visibility, fields, label?}[]`. `command` содержит
тип и неизменные параметры (рекомендуется roundId). `fields` — объект полей:
`{kind:'text', maxLength:80, label?}`, `{kind:'integer',min,max,label?}`,
`{kind:'boolean',label?}`, `{kind:'enum',values:[...],label?}` или `{kind:'ink'}`.
Авторизация выполняется для текущего положения и реального actor; лишние поля,
неверный roundId и значения вне схемы отклоняются до reduce. Проекция имеет
`inputs` только для разрешённого viewer. Обычные actions/reactions сохраняются.

`advance(position, now)` получает явное целое число миллисекунд от хоста,
не Date из пака. Возвращает null при отсутствии перехода или обычный
`{position,events,turnEnded?,roundEnded?}`. Старт получает `options.now`.
Хост продвигает часы до обработки пользовательских команд. Игра может хранить
deadline без постоянного изменения состояния на каждом тике.

## Декларативная сцена

Обычные players/cells/rows/zones/objects/actions остаются общими. Дополнения:

* `canvas:{id,operations,enabled,command}` — команда из input choice с полем
  `operation:{kind:'ink'}`. operations содержат только публичные операции.
* Ink: `{kind:'stroke',id,tool:'brush'|'eraser',color:'#RRGGBB',width:1|2|3,
  points:[[x,y],...]}` (целые 0..65535, максимум 128 точек на пакет),
  `{kind:'fill',id,color,x,y}` или `{kind:'clear',id}`. Удалённые/исторические
  наблюдатели используют тот же компонент. Незавершённые штрихи передаются
  через авторизованный realtime preview порт, не через код/DOM пака.
* `clock:{phase,deadline,label}` — общий таймер, отображаемый хостом.
* `chat:{messages:[{id,text,confirmCommand?}],command?,placeholder?}` — общий
  ввод вариантов. У command динамическое поле text. Для рисующего сообщения
  анонимны; actor угадывающего в его проекцию не попадает.
* `roundResult:{answer,accepted,winner,artist,protests,required}` — публичные
  итоги; принимаемое вручную слово отдельно от исходного. До результата
  answer попадает только в проекцию рисующего (можно `scene.prompt`).
* `controls` — дополнительные общие вводы/выборы; приватность определяется
  проекцией, не скрытием элементов DOM.

Никаких pack-owned HTML/CSS/JS-обработчиков на странице, собственного Date,
сети, storage, копий SDK или отдельного проигрывателя истории.
