# Продолжение 3 ноября: правила, геометрия и увеличенный текст

Предыдущий goal-turn был прогрессом: опубликован проверенный кандидат883dd124…b8b0. Эта итерация продолжает полный GOAL, а не меняет его критерии. Новый кандидат7aa60d95…d0333d503 опубликован в разрешённом временном Funnel; точные идентификаторы и проверенный scope ниже.

## Правила и границы полномочий A08

Подтверждённый P2: host service принимал неизвестный preset/недопустимый option и сбрасывал готовность до проверки на старте. Теперь generic validator объявленных manifest choices вызывается до commit, exact installed pack.version сохраняется. Недопустимая отправка оставляет полный snapshot и remembered defaults прежними; editor показывает понятное поле и предложение повторить выбор. Валидность конфигурации отделена от возможности старта: Ludo teams можно сохранить при2участниках, старт разрешён при4. Unit5/5, browser2/2 на каждом движке. [Отчёт и точный scope](../../../tmp_files/ux-021/a08-followup-1103/report.md).

Отдельный existing-file browser case с настоящими HostTransferUI/Sender/lobbyBundle/promotion и локальными signaling/consent/ACK портами подтвердил законную передачу при открытом editor: прежняя форма закрывается до consent, delayed disposed submit не меняет successor snapshot/defaults, новый host редактирует и возвращается в тот же lobby DOM. Chrome1/1 и WebKit1/1; runtime ради этого случая не менялся. [Границы](../../../tmp_files/ux-021/a08-followup-1103/ownership/report.md). Это не RTC/два устройства/durable fence и не новая проверка реальных сетей.

## Фильтры и общие оси

Устаревший library-filters-browser test проверял удалённые disclosure/Все/Любимые. Он переведён на фактический owned picker: draft/apply/reset/cancel, preview count, root navigation и возврат фокуса. Chromium4/4, WebKit4/4 на320/390/740/1280. Product не менялся ради теста. [Evidence](../../../tmp_files/ux-021/catalog-filter-followup-1103/report.md).

Визуальный просмотр обнаружил clip заголовка, который не виден через scrollWidth. Body min-width320 превышала доступную classic-scrollbar content width300; syncHeader повторно добавлял gutter10px. Исправлены общий available-width sizing и преобразование viewport origin. Фиксированный header совпадает с layout-slot, все три44px quick actions целы. Toolbar допускает естественный перенос «В комнату» при нехватке места. Chrome1/1 и WebKit1/1,20состояний/движок desktop/mobile320/360/390/landscape/font2× с панелью и без. [Измерения и исходный RED](../../../tmp_files/ux-021/header-followup-1103/REPORT.md).

## Каталог при увеличенном тексте

Фиксированная плотность давала134нарушения card-state: исчезавший арт, обрезанные названия/описания и metadata. Общий rem minimum10rem/6rem уменьшает число столбцов по потребности содержимого, сохраняя normal плотности. Обычное описание полностью естественное, compact по-прежнему без description/mechanics, list естественной высоты. Нет определения font-scale или уменьшения шрифта.

Final case: Chrome1/1 и WebKit1/1,27состояний×15карточек=405card-state/движок, violations/errors/native0; existing density Chrome desktop1/1 и WebKit mobile1/1. Приnormal16 из90square states у87геометрия точная; у3реально обрезанных описаний добавлена строка15px с соответствующим уменьшением арта: mage360,UNO360,mage390. Art остаётся>=40px. При2× минимальный арт97.015625px, все проверенные названия/описания полны. [Отчёт, normal deltas и снимки](../../../tmp_files/ux-021/catalog-text-reflow-1103/REPORT.md).

Перестроение по содержимому и относительным размерам сверено с [web.dev: accessible responsive design](https://web.dev/articles/accessible-responsive-design) и [Typography](https://web.dev/learn/design/typography). Измерения продукта не подменяются рекомендациями статьи.

## Навигация при увеличенном тексте

Настоящий Chromium defaultFont16→32 подтвердил фиксированные подписи: nav11→11, Room14→14, filter counter10→10 и badge активной партии11→11. Они переведены в относительные размеры; теперь растут2×. Уже работавшие body/catalog/profile/account/settings не переписывались. SVG/игровые элементы/focus policy сохранены.

Первый числовой PASS отвергнут ведущим и независимым дизайнером: Range выявил разрывы «Общени/е», «Параме/тры». Финальная навигация использует balanced4/2/1 по доступной ширине и единому rem minimum. Normal16 сохраняет4portrait действия и rail84px; при32px на320/360/390/430 читаемые2×2, rail142.28125px. Слова не разрываются; перенос между словами разрешён. Фактические размеры задают reserve под bar и indicatorX/Y/W/H. Rail сохраняет собственную прокрутку и видимость выбранного пункта, а не обещает одновременную видимость всех4строк на низком экране.

Два affected cases ×2engine =4terminal PASS,12typography states/engine. Chrome — настоящий browser font preference, WebKit — controlled root stress. Проверены реальные4действия, durable active record, badge glyph, word Range1rect, границы target и reserve; indicator delta<=0.02px. При16px прежняя nav/button/badge геометрия сохранена; при32px portrait bar173.78px и reserve189px оставляют последний контент над bar. Независимый дизайнер просмотрел6fresh кадров и закрыл scoped word-P1. WK neighbour выявил ResizeObserver loop; обновление размеров перенесено в существующую deduplicated rAF очередь, ошибка не подавляется. Final pageerrors/native0. [Точный отчёт и неудачные этапы](../../../tmp_files/ux-021/type-followup-1103/report.md), [независимый просмотр](../../../tmp_files/ux-021/nav-typography-review-1103/FINAL-REVIEW.md). Сверка обработки размеров: [web.dev ResizeObserver, gotcha/layout work](https://web.dev/articles/resize-observer).

## Итоговый кандидат и проверенная публикация

Один candidate `tmp_files/ux-021/rules-reflow-type-1103/final`; standalone SHA256 `7aa60d952b9d68df579209751206568b0b299906500a2472969b42bd0333d503`; cache `playroom-pwa-v0.21.0-preview.1-6c3fc9fff2fa5ba1`. От883dd124 изменены7runtime-путей, без новых runtime-файлов/locale keys. Build exit0;8SHA/3ZIP CRC;230runtime+2canonical locale JSON, source worker и manifest сверены с source ZIP. Worker/client update protocol не менялся; прежний upgrade proof относится к своей паре и не выдаётся за новый запуск.

Exact assembled HTML с normal motion: Chromium70 и WebKit70 состояний, failures/errors/nativeSupabaseRequests/changedDuringRun0. Root проверил source-freeze hashes и просмотрел финальные enlarged portrait/rail. Полная PWA15игр обновлена в существующих Funnel443/8443 и /hod-021.html.4publicbytechecks совпали, включая весь standalone90HTTP206частями64КиБ по обычному DNS. Live Chromium подтвердил activated worker, точный buildIdentity/cache, protocol1,15игр и PushManager; errors/native0. Рабочее подключение/системный proxy не менялись.

PWA227файлов/6098132байта (+5348байт относительно прошлого кандидата). Не создавались дублирующие runtime-модули; уменьшение общего размера не заявляется. Точные команды/артефакты: `tmp_files/ux-021/rules-reflow-type-1103/{final-manifest.json,source-state.json,artifact,public-check.json,live-pwa}`. Превью https://seth.tail6aebd4.ts.net/. У установленной PWA применяется штатное явное обновление.

Общий GOAL A01–A36 остаётся active/work. Physical/AT, реальная Push-доставка, внешние сети и независимая human usability — отдельные ворота. Ответ телефона о native hand/drag/selection ожидается; эмуляция его не заменяет. Production SQL, штатный релиз, реальные сообщения и объявления не выполнялись.
