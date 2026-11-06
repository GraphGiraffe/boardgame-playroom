# Приёмка ревизии03 — базовый срез final-reviewed

02.11.2026. Этот отчёт относится к точному final-reviewed ниже; последующие правки меню, фильтров и телефонной проверки описаны в LOCAL-CANDIDATE.md и OWNER-ITERATION-03.md. Подготовлен standalone HTML
приложения0.21.0-preview.1 со всеми15играми, коллекция0.8.9-preview.3.
Кандидат: [final-reviewed](../../../tmp_files/ux-021/owner-iteration03/final-reviewed/playroom-all-games.html),
SHA256 `290cf8de98fa41cc1dab503c4b123677157e4d3909246a4c81705a123292ded1`.

## Изменения и доказательства

| Область | Результат | Адресная проверка |
|---|---|---|
| Заголовки/полный экран | Иконка слева, Назад справа; название до2строк, статус1. Fullscreen только у экранов/корней/партии, отсутствует у панелей/диалогов/чата. История из gameheader перенесена в меню; позднее весь список меню раскрыт без спойлера | UI-PLATFORM-ITERATION03, screens-only-manifest: unit24/24, fullscreen/panels/actualRTC по1/1 каждым движком; typed metadata имеет приоритет над class fallback |
| Фильтры/избранное | Все группы открыты; три пресета удалены; состав — прежние иконки с доступными названиями; trigger отделён от scope. Звезда центрируется SVG100%, без offsets | owner-root-filter-icons:2existingcases×2движка; измеренное смещение центра y+1px→0 |
| Параметры/установка | Шестерёнка; Игры/Обновление; Уведомления после Оформления; Установить ХОД последним и скрыт при canonical known-installed. Native/manual install поведение сохранено | owner-root-filter-icons; root-fullscreen-acceptance, текущие actual-artifact кадры |
| Слоты/меню/чат | Добавить бота без изменения сложности; Пауза и На главный экран видны; чат справа у собственной зоны, окружающий фон и резерв для реальных метрик. Dismiss вниз из свободных областей не забирает chat/list/control scroll | UI-PLATFORM-ITERATION03: native Chrome touch, scoped WebKit pointer+wheel; actualRTC обеих ориентаций; предшествующая geometry16/16 обоими и текущие заголовки/руки |
| Общение | Refresh сверху; перестановка удержанием без отдельного режима, ghost; новая самостоятельная активация после drag не теряется, старый compat click подавляется | iteration03-ux:7адресныхгейтов/движок и full long-social по1/1 обоими, native requests0/errors[] |
| Мои партии | Тап карточки/Enter открывает все действия, включая продолжение. Room/mode и progress/actions объединены, информация остаётся видимой. Типичные host182.38→138.58px, local174.17→135.78px; cloud148.58→107.78px | compact-saved по1/1 обоими,320/390/844;8участников и длинные названия без clipping; native card/scroll/Back сохраняются |
| Облачная загрузка | Обычный download/import с записью в IndexedDB работает; ранее тихая ошибка теперь видна в owned context и допускает повтор, не удаляя локальную копию | CLOUD-DOWNLOAD-RECOVERY:по1/1 Chromium/WebKit. Конкретная причина прежней ошибки на телефоне по присланному gameplay-ролику не установлена |
| Удержание карточки | Только текущее действие и ориентированная схема. Изменение текста/схемы отменяет старое нажатие. Mage preview.3; правила не менялись | generic tooltips2/2 каждым; actual final HTML Mage1/1 каждым: movement/attack×4направления и landscape. Chrome native hold; WebKit controlled hold+native обычные действия |
| Эффективность | Убраны измеренные повторные parse/auth/list и SVG/title/header операции | PERFORMANCE-AND-DATA-AUDIT.md; backend count/privacy1/1 +cloud10/10, actualRTC1/1 каждым |

## Готовый артефакт и независимый просмотр

Root использовал существующие artifact drivers: Chromium и WebKit **по80core+
18social состояний на точном SHA выше**. Failures/errors/nativeSupabaseRequests
пусты/0; horizontal overflow и monitored source drift отсутствуют. Это реальные
действия приложения с изолированными provider ports, без отправки сообщений людям.
Отчёты/PNG: `tmp_files/ux-021/owner-iteration03/reviewed-{core,social}`.

Root непосредственно просмотрел текущие фильтры, Параметры, карточку/панель
действий, меню партии, landscape Домино, и portrait/landscape Mage tooltip.
Панели на этих кадрах не содержат fullscreen. В карточке сохранены сведения,
в меню доступны продолжение/история/удаление/облако. Canonical build exit0,
все8SHA и3ZIP CRC корректны; source-state.json хранится рядом с HTML.

Actual final HTML Mage case также прошёл обоими движками с тем же SHA и exact
companion0.2.7-preview.3. WebKit установленной версии не открыл file:// при
context offline:true (navigation internal error до приложения); финальный
WebKit file проход использует normal context и заблокированные HTTP(S) routes,
внешних попыток0. Chrome использовал native context offline. Эта граница
зафиксирована в mage-tooltip reports и не выдаётся за физическую OS-проверку.

## Открытые границы

Владелец ещё принимает этот конкретный кандидат на телефонах. Headless CPU
samples не доказывают FPS/полную задержку fullscreen реального iPhone/Android.
Внешние сети/Push, реальный backend и применение SQL/публикация принимаются
отдельно. SQL и wire format этой ревизией не изменялись. Старые кандидаты
сохранены; экземпляры final-build/final-compact предшествуют последним уточнениям.
Общий GOAL не объявлен complete.
