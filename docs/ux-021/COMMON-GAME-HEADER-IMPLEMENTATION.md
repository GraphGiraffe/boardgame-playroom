# Общая шапка партии и устойчивая геометрия после поворота

Последнее указание владельца: вместо большого одинокого названия использовать
обложку игры и 1–2 полезных быстрых действия. Это одна реализация в
`app/game-screen.js` и `app/game-frame-021.css`, без отдельных изменений паков.

В портрете: cover 32 px, название 20 px с ellipsis, доступная История,
Полноэкранный режим и Меню с областями 44×44. В узкой альбомной боковой зоне:
cover 20 px, название 16 px с ellipsis, Fullscreen и Меню. При необходимом
контекстном переключателе поля он имеет приоритет над Fullscreen. Иконка
обложки обрезает пустой SVG viewBox существующим `fitCovers(header)`.
Автоматическое уменьшение шрифта до 14 px к новой шапке не применяется.

При открытии меню `gameMenuActions()` смотрит на **реальную видимость** своих
quick buttons. Видимые History/Fullscreen не дублируются в меню; скрытые
быстрые действия остаются доступны там через прежние handlers. Настройки,
правила, лобби, остановка и редкие команды сохраняют свои места и права.

Fullscreen сетевой партии теперь делегирует в тот же AppBridge.fullscreen,
что локальный экран и настройки. Второй fallback engine не создаётся:
существующая функция выбирает native API либо штатный режим без него.

## Общие опорные линии

Совместно с code reviewer принят `--surface-inline-inset:12px` для root/modal/
game chrome. `--game-field-inset` остаётся отдельным осознанным inset поля:
8 px в портрете, 6 px в альбомной ориентации. Full-bleed header выходит из
field inset через семантический margin и получает собственный chrome inset,
не уменьшая ширину поля или руки. В альбомной ориентации шапка остаётся в
левой зоне оппонентов. Общий modal header больше не добавляет второй inline
padding поверх padding собственного frame.

Code reviewer владеет token/base/gutter/root changes в styles/design-system/
hub-shell; UI owner изменил canonical screen/panel token references и общий
header grid. Последующая проверка дизайнера заменила раннее исключение для
full-game: теперь native stable both-edges gutter действует **одинаково везде**.
На desktop controls следуют content edge с учётом настоящего gutter; на
телефоне с overlay scrollbar резерв равен нулю и edge остаётся viewport edge.
Покомнатных исключений и JS-компенсации ширины scrollbar нет.

Actual RTC case на текущем owner grid подтвердил одинаковую leading line
игры и settings modal в обеих ориентациях: Chromium **22/22 px** при native
content edge 10 px; WebKit **12/12 px** при content edge 0 px. Отступ внутри
content edge — общие 12 px. Back — border-box 44×44, gap 8 px, title axis
Back.right+8 (Chromium74 / WebKit64). Старые отдельные header gap/padding и
compact shrink overrides удалены из исходных правил. Quick targets 44×44,
поле landscape 364×364; меню не remount scene.
Отсутствие native fullscreen API задано как controlled capability:
сетевой quick action входит и выходит из штатного fallback, сохраняя scene.
Это не проверка native Safari или физической установки.

## Найденная общая ошибка поворота

Строгий existing all-pack case выявил Ludo: до поворота action slot/child
80/80 px, после возврата slot 56 при child 80, self 88→64 и центр поля +12.
`layoutScene(false)` уже сохранял первый измеренный lock, хотя следующий
requestAnimationFrame должен был перемерить CSS после смены ориентации.
Одного снятия старых locks было недостаточно.

Теперь новый первый lock ephemeral: в `fixedLayouts` он попадает только при
`settled===true`. Перед повторным измерением удаляются только собственные
generated action styles. WeakMap хранит original values/priorities и
generated values, поэтому произвольный авторский height не стирается.
Неизменившийся layout key по-прежнему сохраняет поле при исчезновении рук.
Условия по GameID, движку браузера и ослабленная погрешность не добавлялись.

## Проверки и пределы

- `case/game-screen`: 23/23 PASS для общей шапки/toolbar/render contracts;
  выполнен до заключительной DOM-only action-lock correction.
- Existing `collection scene geometry survives…`: финально **Chromium16/16 +
  WebKit16/16 PASS**, все15 installed packs. Скрытие рук и portrait→landscape→
  portrait сравниваются с прежней погрешностью 1 px. Вместо произвольных 50 ms
  fixture ожидает все регистрации engine, fonts.ready и два native frames.
- Existing `game overlays 0.21…`: **Chromium1/1 + WebKit1/1 PASS** после uniform
  gutter/header grid, проверены quick/menu fallback, native focus/Back,
  actual RTC room/team chat, draft/resize/covered read policy и Group return.
  Ранние passes предшествовали SVG crop/action-lock correction; текущий повтор
  owner-grid включает обе эти правки. Authority/handlers не менялись.

Текущие логи: `tmp_files/ux-021/header-owner-grid-{geometry,rtc}-{chromium,webkit}.log`.
Manifest: `tmp_files/ux-021/header-owner-grid/final-report.json`; прежние
common-game-header logs/manifest сохраняют историческую provenance.
PNG `ui-platform-audit/*-gameheader-{390,844}.png` и `*-menu-settings-*.png`
пересняты текущим actual RTC pass. `common-game-header/*-roundtrip.json/png`
— **исторический RED diagnostic**, не текущая визуальная приёмка.
Публикация, production/provider state и правила игр не менялись.

Текущий адресный pass измеряет Game и Settings; отдельный существующий
checkpoint дизайнера для Lobby/Reader/Packs/Account/Editor повторяет root
после saved-branch freeze. Эти остальные экраны не объявлены здесь визуально
принятыми на основании двух измеренных headers.
