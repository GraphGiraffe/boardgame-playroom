# Повторные вычисления и следующий SDK — 4 ноября 2026

Проверенная полная временная [PWA](https://seth.tail6aebd4.ts.net/) обновлена (также порт8443 и [standalone](https://seth.tail6aebd4.ts.net/hod-021.html)). App0.21.0-preview.1 / collection0.8.9-preview.3,15игр, прежний installed2fee8a. SHA256 `9ad6474793fd8405aeb61eef22915b68327a95af1f8e3daa4eaba125b93a1348`, cache `7478ca880eb0b515`. PWA227файлов,6 119 837байт. Stable/Pages/R2 и реальные Push/сообщения не выполнялись.

## Что изменено

- Engine.project больше не копирует закрытые data/сырые events/RNG перед их отбрасыванием и отдельной авторизованной проекцией. Header/players/result/timeline по-прежнему независимы от authority; обязательные model-снимки сохранены. Это не общий кэш приватных проекций.
- Повторная активация пака не записывает неизменившийся stylesheet заново; реально изменённый CSS восстанавливается. Реестр/версионная активация сохраняют прежний порядок. Это устраняет лишнюю инвалидацию стилей, а не доказывает устранение всей задержки.
- Анимационная копия переиспользует стили корня и список потомков внутри одного capture. Для временно скрытого источника после раскрытия стили читаются заново; исходная поза сохраняется. Нужные flight clones, CSS-свойства и приватность не отключены, межкадрового кэша нет.
- Повторные одинаковые input selection/view-key/range/preferences не строят сцену, если последний неизменяемый session/state/viewer и остальные контекстные входы актуальны. Настоящее снятие выделения/clear hint/смена значения обновляет сцену. Смена контекста инвалидирует запись; выход/удаление очищают удерживаемые session/state/tutorial refs. Начальное feedback.start использует уже имеющиеся разрешённые events вместо дополнительной проекции того же состояния/зрителя. Удалённый export fallback был недостижим для canonical Session: его удаление не выдаётся за ускорение.

## Проверено

| Проверка | Результат и границы |
|---|---|
| Root unit cases |6отдельных existing cases: engine privacy/results/pinnedversions, session private-detached replay, views privatehands, pack activation/reveal — каждый PASS1/1 |
| Regression counters | Старый project22 vs19обязательных сериализаций на3проекции; новый не добавляет лишних. Повторный stylesheet3 vs1запись, новый1; внешняя замена восстанавливается |
| Анимации | Chrome20/20 +WebKit20/20, visible root getComputedStyle3→1; hidden reveal сохраняет нужное повторное чтение. Старый94module18/18×2 |
| Независимый просмотр |16matchedPNG/4состояния×2движка; pose/face/back/ratio/privacy/cleanup metrics совпали,7/8PNGпар идентичны. Chrome own-play2154px внутри cardbbox отличаются: причина не доказана, capture variance сохранена; blanketpixelPASS нет |
| Input actual app |1existing counter-case×2настоящих движка на finaltest29ef: real same-selected drag V.render0/register0/sameNode, repeatMagechoice0; deselect1/pressedfalse, clearhint1/popup0, feedback extra project0, stylesheetmutations0; errors/native0 |
| Точный standalone |12catalog+18game states/engine; новая сборка Chrome/WebKit, normalmotion, ошибок/native/drift0; root просмотрел Chrome390/WebKit844 Domino |
| Сборка |exit0,8SHA/3ZIP CRC,230runtime+2canonical locale+5изменённых existing test sources совпали с sourceZIP;4canonical Klondike файла/installed иsourceworker неизменны |
| Публикация |Funnel443/8443+/hod на новый final;4exactpublicbytechecks; live Chrome activeworker/buildIdentity/cache совпали,15игр,protocol1/errors0 |

Все свидетельства: `tmp_files/ux-021/targeted-render-1103/{projection,capture,markup,design-ux,performance,artifact,artifact-game,live-pwa,final-manifest.json,public-check.json}`. Root code review и независимые design/UX review в этих каталогах; общие файлы имели одного владельца.

Новые range/preferences guards проверены по исходнику; указанные два actual-app прогона не упражняют эти контролы. Нулевой V.render для настоящего no-op не означает отсутствие всех authority-проекций: native drag по-прежнему делает необходимые проверки действий. Общий scope не расширяется до всех игр или всех UI-входов.

Начальные неуспешные проверки сохранены: instrumentation сначала ошибочно запрещал обязательные model-снимки (исправлен относительно direct pack baseline); views/motion fixtures недогружали актуальные vector dependencies; Chrome native drag fixture не начинал drag (добавлены реальные видимые координаты и проверка поднятия); root artifact selector пропустил prerequisite game-card-rules, поэтому catalog12PASS, lobby/game timeout. После исправления выборки отдельно прошёл dependent game route18/engine; исходный отчёт с timeout не объявляется green. Исходный предварительный snapshot probe с неверным cwd не выполнился; build при этом завершился0, фактические hashes проверены отдельно. После finaltest-only изменения sourceZIP штатно обновлён, runtime/HTML/cache идентичны; успешные runtime checks не повторялись ради архива.

## Производительность: остаток открыт

Один контролируемый Spider seed17/action740×390 на реальном headless Chrome156: прежний94c44 → новый9ad647, click→nextRAF100,5→99,7мс; handler87,877→86,202мс; LongTask100→99мс. Это НЕ доказывает заметного ускорения: разница укладывается в разброс. Функциональные browser handles были закрыты до последовательной пары. Одинаковые fixture/state/action/point/rect/script/browser проверены, rawCPU/trace сохранены. Оба эпизода сделали move0→1, rng тот же, busyfalse/errors[]. Изолированный fixture заблокировал одинаковые4локальные фоновые URL; это не realworker/provider тест.

Остаточный stall около100мс и построение монолитной recipe/markup для реального изменившегося состояния/выбора остаются OPEN. Предыдущая пара457b→94c44 с132,6→99,1мс — отдельная историческая проверка; её нельзя использовать вместо нынешнего baseline для преувеличения эффекта этой итерации. Нет доказательства FPS/INP распределения, скорости телефона, всех ходов15игр или отсутствия всех зависаний.

Принципы сверены с [web.dev: ограничение layout и порядок reads/writes](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) и [rendering pipeline](https://web.dev/articles/rendering-performance). Удаление лишней работы поддерживается counters; задержка оценивается отдельным измерением.

## Следующий релиз

По решению владельца создан следующий после0.21 релиз ROADMAPler «SDK паков»,6planned задач, без назначенного номера/даты. [Полный состав](../PACK-SDK-NEXT-RELEASE.md) включает все указанные владельцем подсистемы и дополнен совместимостью/версиями, восстановлением, локализацией/доступностью, диагностикой/инструментами/contract tests и точечным regional rendering. Существующая задача examples использована повторно; прежние timer/migration/PWA задачи не удалены и не объявлены выполненными. Цель — общие реализации и миграция существующих игр, а не одна новая документация. Независимая scope review не нашла пропусков; уточнена граница domain/presentation executor.

Полный GOAL0.21 остаётся active/work. Все игровые исходы, звуки/анимации/DnD/обучения15игр не пройдены; физические устройства/реальная слышимость входящих сообщений и приглашений/Push/внешние сети/AT/самостоятельная usability остаются открытыми. Будущий SDK не закрывает эти текущие пункты автоматически.
