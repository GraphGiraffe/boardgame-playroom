# Отзывы с телефона: preview.68 / collection.41

Исходные записи владельца: 11 ноября,083946(иконка),085046(conditional layout),090929(panel pull); скриншоты6888/6890/6892/6894/6897/6899/6901. Изменения собраны одним кандидатом; stable не публикуется.

## Общий интерфейс

Refresh списков сохраняет исходный SVG и геометрию; pending меняет фон, aria-busy/disabled и ownership остаются прежними. В лобби название занимает отдельную строку, cover48px с небольшим padding остаётся самостоятельной сменой игры, краткая строка использует один важный параметр. Текст ведёт в editor, Rules отдельной кнопкой справа под названием. Native label/button association сохраняет один keyboard tab stop и не перекрывает три hit-области. Landscape overview не сжимает название в узкую колонку.

## Карточки параметров

Output под артом визуально скрыт, выбранное значение доступно AT/live output. Пояснения и опции короткие, до двух строк без line-clamp. Условный параметр остаётся в своём slot, недоступный затемнён/controls disabled, help доступен. Неприменимые поля исключаются из отправки, но draft для возврата сохранён. Controls выровнены по нижнему краю ряда, help44px закреплён справа сверху.

Размеры preview/detail/summary резервируются по ограниченному набору публичных вариантов, синхронно до paint; реальные input/checked/output/authority не переключаются ради измерения, исходные узлы возвращаются по ссылкам. Состояние кешируется и пересчитывается при изменении доступной ширины, observer отключается с владельцем. Нет клонированных ghost previews. В mode-карточке fleet занимает ширину,5колонок сохраняют пропорции; не более одного явно объявленного mode-поля. Дурак объявляет settings.variant; Косынка при Vegas показывает locked maxPasses с правилом draw1→1проход/draw3→3, включая первый проход. Host читает public hints, не пересчитывает правила игры.

## Правила всех игр

Проверены15brief/full,60phone/orientation states,196illustrations и68tables. Shared diagram-grid получает2×2 там, где помещаются две карточки; aspect ratios сохраняются, при крупном тексте доступен естественный reflow. Длинные последовательности остаются едиными. Fullwidth list-фоны ограничены30rem и центрированы; phonewidth не уменьшается. Таблицы используют intrinsic/auto columns и обычные переносы без отрывания букв/уменьшения шрифта. Заголовок конфигурации — «Параметры игры», включая320px/font32. До/после таблиц дополнительно проверены32states/68tables. Root/агенты просмотрели контакты и худшие примеры, а не только метрики overflow.

## Общий жест нижних и боковых панелей

Общий bindPanelGesture читает CSS placement --surface-dismiss-edge:bottom/right/left; нижние панели уходят вниз, боковые — наружу к своему краю. Общий механизм подключён к typed modal panels, меню и чату без отдельных игровых реализаций. При scrollTop>0 остаются native scroll/inertia; если браузер уже забрал pan, требуется новый pull после достижения верха. Достаточный сдвиг или быстрый короткий flick закрывает через существующий Back, короткий/отменённый жест возвращает панель. Inputs/ranges/editable, горизонтальные scrollers, pinch и выделение не становятся dismissal. Явный data-surface-pull-through позволяет previewbutton передать вертикальный drag панели, сохраняя один tap/cycle и отсутствие Save при закрытии.

Chromium проверен настоящим CDP touchmove; WebKit — controller events и native mouse/handle, не native iPhone touchscreen. Source integration открывает настоящие параметры UNO, tap меняет draft один раз, pull закрывает через Back без записи rules/revision.

## Проверки и границы

Целевые source/regression проверки и отдельный final exact-artifact gate записаны в tmp_files/refresh-rule-grid-1111. Авторитетны финальные SHA/логи, а не версии на скриншотах. Companion8паков/.41, compiler parity и source wrappers синхронизированы. Неизменённые игры/сеть не перезапускаются полным suite.

Это browser-emulated phone/tablet/desktop UI, не физический Samsung/iPhone, OS-keyboard/VoiceOver/TalkBack или новая real Online/max-clients проверка. Primary guidance: web.dev interaction/responsive-accessibility и W3C APG dialog/tabs; геометрия/достижимость/возврат фокуса/нативный scroll проверяются отдельно. Новые owner отметки не стираются; обновлённый чеклист сбрасывает только затронутые пункты.

Режим settings.variant Дурака и inactiveWhen Косынки требуют parameter-previews-v2; только эти два пакета объявляют новую возможность SDK. Каталог проверяет её до загрузки и сверяет с bundle; старый каталог без поля по-прежнему проходит полный importer. Для неподдерживаемой возможности приложение предлагает обновление без внутренних API-терминов. Остальные шесть обновлений содержат только короткие подписи.
