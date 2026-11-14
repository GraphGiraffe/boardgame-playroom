# Точечная геометрия, обучение и проверенное превью — 03.11

Опубликована полная временная [PWA](https://seth.tail6aebd4.ts.net/) (также порт8443) и [standalone](https://seth.tail6aebd4.ts.net/hod-021.html). App0.21.0-preview.1, collection0.8.9-preview.3,15игр; Klondike0.2.5-preview.3. Standalone SHA256 `94c44c6389c9f152c12f2c4af4c1ba2b870eee9df98659ff8859cc50aade113c`, cache `65d8083774baf00a`. PWA227файлов,6 117 224байта. Stable hosting и паки R2 не публиковались.

Обычный ход, выбор, эффект и готовность обучения больше не запускают общий геометрический layout игровой сцены: общий DOM patch сообщает затронутые области, fitters обслуживают только их. Новая сцена и настоящий resize контейнера выделены отдельно; удалённые наблюдения и RAF очищаются. Смена session/viewer/replay не переиспользует приватные данные. Turn-индикатор обновляет затронутые группы. ResizeObserver откладывает запись в принадлежащую сцене RAF-очередь, устраняя обнаруженную петлю WebKit.

Требование пользователя о полном отказе от пересчёта сцены ещё не выполнено во всех слоях: pack renderer пока создаёт строку authored markup на ревизию, затем DOM обновляется точечно. Это следующий участок для оптимизации; нельзя считать отсутствие общего layout доказательством отсутствия всех повторных вычислений. Обязательные эффекты и immutable границы не отключались.

Исправлены anchor обучения Klondike collect (реальный double-action), актуальность quiet/readiness без повторного project/render/layout и пропавшие read-only кубики replay Ludo/Yatzy. Старый установленный Klondike v2 и сохранение остаются совместимыми, без скрытой конверсии.

| Проверка | Фактический scope |
|---|---|
| Сборка | exit0;8SHA,3ZIP CRC,230runtime+2canonical locales и7изменённых existing test sources совпадают с sourceZIP |
| Точный standalone |74состояния Chrome +74WebKit; failures/errors/native/drift0; локальный profile Save/Cancel и A13 enable/revoke/draft |
| Pointwise core | Chrome/WebKit: адресные browser и identity guards, публичная проекция и replay; обнаруженные RED сохранены |
| Обучения | Klondike8/8целей через29действий, Spider5/5; full/quiet по одному existing case ×2движка, late guards/reset/cache старой версии |
| Геометрия | Existing scene-case Chrome/WebKit;7начальных/продвинутых сцен×6viewport плюс существующие reserve/public/replay проверки; отдельный Mage8players12состояний/engine |
| UNO ввод | Текущий real Chrome:13/13мышь/native touch. Это не физический телефон и не WebKit parity |
| UNO local RTC | Текущий Chrome1/1 и WebKit1/1: permission/третье подключение/revoke, seat/start/pause/move/privacy. Реальные сети/TURN не проверены |
| Native font | Реальный Chrome12состояний UNO/Ludo/Domino, portrait/landscape, font16/32 |
| Mage |3existing gameplay/effect cases ×2движка; до финальной shared-core правки, source Mage не менялся; это scoped reuse, не полный повтор финального runtime |
| Публикация | Funnel443/8443+/hod;4exact public-byte checks; live Chrome activated worker, точный cache/buildIdentity,15игр,protocol1,errors0 |

Evidence: `tmp_files/ux-021/pointwise-learning-1103/{final-manifest.json,public-check.json,artifact,live-pwa}`; source/game reports в `tmp_files/ux-021/current-game-checks-1103/{performance,solitaire-tutorials,incremental-layout,mage,rtc,uno-native-current,native-font}`.

В контролируемой паре одного и того же Spider seed17/action на desktop Chrome click→nextRAF132,6→99,1мс, LongTask132→99мс. В новом обработчике отсутствует sampled attribution layoutScene/fitField; styledClone~21,4мс остаётся. Это один эпизод с профилировщиком, не статистика FPS/телефона/15игр. Остаточный99мс input stall открыт. Checkers Hard100ходов на3seed: botAction p95~1,92мс; это не гарантирует отсутствие зависаний других ботов.

Коррекция происхождения браузера: ранние root-логи RTC chromium-02 и native-font попытка под WebKit shim фактически были WebKit. Итоговые `chromium-actual-current.log`/`webkit-actual-current.log` и `native-font/chromium-actual.log` используют правильный движок. Artifact runner использует прямой playwright-core, его Chrome результаты не затронуты. Старые root A26 engine-label claims также не переносятся; текущий exactHTML заново проверил Save/Cancel в обоих настоящих движках.

Полный GOAL остаётся work: все игровые исходы/анимации/DnD/обучения15игр не пройдены, реальная слышимость входящих сообщений/приглашений/Push и физические устройства не приняты; универсальный звук каждого меню/клика отсутствует. Плотная Mage8 геометрия не означает удобство телефона. Физические UNO/Push вопросы без ответа остаются открытыми. Новые SQL, реальные сообщения/Push или сервисные изменения не выполнялись.
