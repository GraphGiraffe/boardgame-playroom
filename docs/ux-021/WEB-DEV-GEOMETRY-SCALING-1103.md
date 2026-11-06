# Геометрия и масштабирование общих элементов — 2026-11-03

Общие экранные подписи теперь учитывают пользовательский размер шрифта. Проверены общие экраны и панели при ширине 320/390/740 CSS px, а также HUD трёх типов игр. Изменения исходников заморожены; сборку и публикацию выполняет root отдельно.

## Основание и границы

[Accessible responsive design](https://web.dev/articles/accessible-responsive-design) требует сохранять пользовательское увеличение и адаптивную компоновку. [Fluid type](https://web.dev/articles/baseline-in-action-fluid-type) отдельно объясняет влияние пользовательского шрифта и ограничения размеров, зависящих только от viewport. Для общих подписей применены относительные роли; для промежутков сохранены общие токены и `gap` ([spacing](https://web.dev/learn/css/spacing), [logical properties](https://web.dev/learn/css/logical-properties)). Минимальная зона общих кнопок 44 px — согласованный стандарт проекта. Это не заявление о полном соответствии всего приложения всем рекомендациям web.dev.

Проверки различают пять вещей: ширину layout viewport; нативную настройку Chromium defaultFontSize; контролируемое удвоение computed font-size без изменения остальных свойств; нативный двухпальцевый жест CDP; отдельно эмулированный visualViewport.scale=2. DPR и уменьшение скриншота не используются как доказательство reflow.

## Доказанные ошибки и исправления

| Ошибка | Исправление общего источника |
| --- | --- |
| Root font16→32, но body/заголовки/подписи оставались16/20/13 | `element-sizes.js` выдаёт типографические bindings в rem, остальные семейства остаются px; общие shell и HUD используют относительные роли. |
| Fluid catalog title12.96→24 вместо полного удвоения | Для представлений каталога выбраны дискретные относительные роли, без конкурирующего cqw. Итог из одного source:13→26, description12→24, tag11→22. |
| Hero nowrap и фиксированная строка метаданных не вмещали увеличенный текст | Перенос длинных строк и растущая строка метаданных вместо фиксированной высоты. |
| Числовые форматы2+/4+/6+ обрезались: scrollHeight94 при clientHeight42 | Auto ширина/высота с минимумом44 и относительным размером текста; шрифт не уменьшается. |
| Theme «Светлая» при320/text200: scrollWidth140 при clientWidth128 | Root добавил перенос ordinary label; preview и размер шрифта сохранены. |
| Native pinch закрывал панель как pull-dismiss | Root: общий latch нескольких touchIDs до завершения всех пальцев; CSS сохраняет pinch-zoom. |
| При visual scale2 однопальцевый pull закрывал панель чтения | Root: zoomed guard и owned data-surface-zoomed; общая CSS free-area разрешает pan-x pan-y pinch-zoom. При scale1 штатный pull закрывает панель. |

Root отдельно исправил ordinary input и Appearance captions/palette intrinsic sizing. Эти изменения включены в финальные геометрические измерения; их собственный native font consumer regression описан в `WEB-DEV-AUDIT-1103.md`. Палитра сохраняет принятые2–3 колонки при обычном шрифте; увеличение текста может уменьшить число колонок.

## Итоговая проверка

- Chromium **1/1**, WebKit **1/1**: по36 состояний — Games, Profile, Settings, Data, Appearance и Filters при320×740/390×740/740×390, обычный текст и контролируемый text200. Нет непреднамеренного горизонтального overflow, обрезанных функциональных подписей, общих targets меньше44 или ошибок CSS-центровки. Typed screen/panel имеют равные боковые inset и headerInsetError=0. Roots/landscape rail измеряются отдельно.
- В60 измерениях SVG на движок центр painted bounds относительно собственного SVG viewport имеет ошибку0; CSS-box иконки относительно самостоятельной icon-button также0. Это проверка показанных back/settings/star, не оптическая приёмка всех рисунков.
- Chromium native defaultFont16→32: body16→32, heading20→40, tab13→26, settings label14→28, range value13→26. Account3tabs13→26, field/error14→28, input16→32, без обрезки. Appearance native32: functional controls без обрезки/горизонтального overflow.
- Native game preference **1/1**,12 состояний: UNO/Ludo/Domino ×390/740 ×font16/32. Общие title/player/status удвоены; поле/рука/панели остаются в своих границах; законное действие либо законный выбор фишки достигается реальным hit-test. Просмотрены все6 кадров native32. Статус допускает согласованный однострочный ellipsis, заголовок — две строки. Nominals и рисунки карт/костей/фишек не переводились в UI typography.
- Type catalogue unit **1/1**: type bindings rem, card geometry px. Все browser cases: errors=[], nativeSupabaseRequests=0; реальные сообщения/auth/cloud не использовались.

Нативный CDP pinch не увеличил даже пустую контрольную страницу в этой среде (scale1); поэтому физическое увеличение на телефоне не объявляется проверенным. Доказано: реальные два touch pointer не закрывают панель; отдельно Emulation scale2 сохраняет layout width390, visual width195 и существующую поверхность; контролируемый reading pull не закрывает её, а при scale1 закрывает. WebKit покрывает reflow/text stress; нативная defaultFont preference измерена только в Chromium.

Преднамеренный clamp description/title и статусный ellipsis отделены от функционального clip. Тест не означает проверку всех возможных состояний, всех паковых художественных надписей, полноэкранных особенностей физического Safari или всех OS-настроек масштаба. Dialog-specific geometry не входит в эти36 состояний.

## Воспроизводимые команды и evidence

Рабочий каталог `playroom`, Node22.14.0 из `/home/ivan/.nvm/versions/node/v22.14.0/bin` в PATH. Перед выбором использован `node scripts/codex/test.cjs case/settings-layout-browser --list`.

```sh
node scripts/codex/test.cjs case/settings-layout-browser --name 'shared surfaces 0.21 reflow text scaling and native pinch retain usable geometry'
source ../tmp_files/toolchain/webkit.env
node scripts/codex/test.cjs case/settings-layout-browser --name 'shared surfaces 0.21 reflow text scaling and native pinch retain usable geometry'
```

В обычном Chromium environment:

```sh
node scripts/codex/test.cjs case/game-layout-browser --name 'native font preference preserves representative card dice and board game panes'
node scripts/codex/test.cjs case/interface-scale --name 'standard size catalogue has discrete monotonic families and valid component roles'
```

Итоговый manifest: `tmp_files/ux-021/web-dev-geometry/final-manifest.json` в workspace. В нём SHA25615 исходников/тестов, команды связаны с точными логами. Рядом `chromium-report.json`, `webkit-report.json`, `games-native-font32-report.json`, исходный `chromium-baseline-report.json`, RED `chromium-zoom-pan-red-report.json`, native32 screenshots и `games-font32-contact.png`. Финальные логи: `web-dev-geometry-final-{chromium,webkit}.log`, `web-dev-game-font32.log`, `web-dev-type-unit-green.log` в `tmp_files/ux-021`.
