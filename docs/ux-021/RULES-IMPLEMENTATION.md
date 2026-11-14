# A08 — Пресет и подробности, 02.11.2026

## Позднее указание владельца: открытые разделы и компактные параметры

Общий спойлер удалён. Текущий порядок: Порядок игры → Параметры → Завершение;
неприменимые разделы скрыты. Preset находится в Параметрах. Завершение определяется
реальным ruleGroups.end, без game-ID исключений; остальные поля следуют схемам.
Две колонки при ширине от360px, одна при320; одиночные поля и openHands широкие.
Form names, exact IDs, visibleWhen, readBack, Apply/Cancel и reset не менялись.
Ниже описан исторический перенос с details; он не отменяет это позднее указание.

Существующий `case/rc2-hub-browser --name 'hub favorites, recent game'` мигрирован
на per-pack disclosure и актуальные game/room context panels: Chromium1/1,
WebKit1/1, исходные order/visibility/reload/preset/deck/recent assertions сохранены.
Редактор затем проверен существующими `case/rule-settings-browser --name
'grouping, drafts and exact IDs'`: Chromium3/3 и WebKit3/3, по12игр на320×740,
390×740 и740×390. Проверены отсутствие общего details, строгий порядок видимых
разделов, placement всех schema fields, native categorical IDs/numeric ranges,
условный jokerMode, infinity, help, Cancel, Apply и повтор после reload.
Safe fetch boundary установлен до goto; nativeSupabaseRequests0/pageerrors[].
Новые кадры: workspace `tmp_files/ux-021/rules-buckets/{engine}-{uno,ludo}-{width}.png`.


Источник композиции: выбранный rules=0 в connected prototype-v1, function rules(c,0)
и нормализованные fidelity/reference-rules-{390,844}.png. Дизайнер подтвердил, что
карточка сверху содержит summary, восстановление стандарта и реальный preset,
если вариантов больше одного; подробности находятся ниже, единственный Save закреплён.
Демонстрационные лимит очков и подсказки не выдумываются для паков, где их нет.

showRoomRulesEditor в app.js теперь создаёт новый rules-v021 markup, отдельный
room-rules-021.css. Старые rule-group/rule-grid/rule-common и #room-rules-form
двухколоночные/footer blocks удалены из lobby.css. Значения доменных IDs, apply,
reset и visibleWhen не изменены. Верхняя карточка показывает актуальные
«Стандартные/Свои правила» и краткую сводку; common first/seat order теперь
подписанные selects после параметров пака, не первая icon-radio toolbar.
OpenHands — компактный pill с настоящим checkbox. Никакого общего max640 в landscape.
Чтение правил остаётся отдельным header action; Back восстанавливает именно
редактор с несохранёнными значениями и прежним scroll через captureModalReturn.
Пояснения каждого поля доступны на прежних question-popover controls.

Общий конфликт fixed footer устранён в element-sizes.css: legacy margin теперь
относится только к .modal:not([data-ui-surface="screen"]). Screen-компоненты владеют
своими отступами; новый override specificity не добавлен. У A08 footer x0/widthviewport,
кнопка inset12 как в reference, а не прежние34px.

Проверки:

- /tmp/hod-rules-fidelity.cjs: Chromium9checkpoints и WebKit9checkpoints PASS,
  errors[], Klondike/Domino/Ludo390×844 и844×390. В каждом: summary перед details,
  one-column form, fixed footer fullwidth в viewport, no horizontaloverflow;
  реальный preset/value apply/readBack с сохранением draft, reopen и reset.
  Ludo применяет preset teams, Домино endMode last, Косынка draw1.
  Свернутый/раскрытый details и настоящий help popover/Escape также проверены.
  Артефакты tmp_files/ux-021/rules-021/{chromium,webkit}-report.json и PNG.
- /tmp/hod-rules-metrics.cjs: отдельный actual Back из editor отменяет несохранённый
  endMode, восстанавливает room context, повторный вход читает сохранённое значение.
- /tmp/hod-final-ui-rtc.cjs:9checkpoints PASS, errors[]: A08 readBack/apply передаёт
  endMode last второму настоящему RTC-клиенту, сохраняя roomid и тот же channel;
  затем lobby/play handoff, settingsreset exactscene, live reply/reaction и Stop.
  После косметических footer/pill/inset CSS правок RTC не повторялся: логика и
  transport hooks не менялись.
- /tmp/hod-update-footer-check.cjs: available/ready update UIfixtures после общего
  footer ownership fix, no horizontaloverflow,6px meter, reduced-motion none;
  настоящий download/install/Push в этой проверке не выполнялся.
- node --check app/app.js и git diff --check PASS.

Первые браузерные попытки остановились на неоднозначном selector close-modal
(Back и Понятно). Сценарии исправлены на конкретный header Back; успешные результаты
выше относятся к последующим полным проходам. Probe без профиля упёрся в обычный
onboarding; это не считается проверкой UI. Физические телефоны/клавиатуры и все
командные раскладки этим адресным A08 набором не подтверждаются. Полный visual
fidelity всех экранов остаётся в совместном review, не выводится из9checkpoints.

После независимой сверки строковые категориальные значения переведены с range на native select в общем ruleControl. Числовые значения сохраняют declared range; доменные IDs и чтение форм не меняются. Повтор `/tmp/hod-rules-fidelity.cjs`: Chromium 9/9 и WebKit 9/9 PASS на актуальных источниках.
