# RC26: масштаб, устойчивые экраны и исправления Лудо

Приложение 0.18.0-rc.26, коллекция 0.7.0-rc.19, Лудо 0.2.0-rc.9; отдельный канал 0.18-rc.19. Это кандидат, не стабильный выпуск 0.18. Main/production остаются app 0.17.6 / collection 0.6.5. Предыдущие теги, каталоги и preview неизменяемы.

## Состав

Включает все возможности RC25 и прежних кандидатов, а также все последующие исправления из e7df335 и b3a9694 приложения и bc40707 паков.

- Три дискретных слайдера: громкость с mute, прежние скорости анимации, масштаб 50–150% с шагом 10%, исходно 100%. Все точки видны; недоступная часть линии серая, выбрать её нельзя. Безопасный предел зависит от окна, поворот временно ограничивает сохранённый запрос. Настройка только локальная, состояние партии не меняется.
- Общая компоновка учитывает масштаб, сохраняет экранные координаты жестов/анимаций, фиксированные области партии и квадратные доски. Читаемые карточки игроков, единая активная карточка хода, границы повёрнутых счётчиков, 44 px для кнопок, обрезанные равномерные мини-руки, доступная прокрутка собственной руки. На коротком landscape передача устройства и игровые действия делят один ряд.
- Лудо: «Фишка — выбор, клетка или кубик — ход». Своя фишка на клетке назначения остаётся целью выбора; выбранной фишкой можно сходить клеткой или кубиком. Выход с базы одним нажатием сохранён. Настоящий бросок после передачи очереди анимируется, сохранённые грани не запускают прежний бросок повторно.
- Autoplay истории передаёт звуковые события в общую очередь. Остановка/выход отменяют звук и не изменяют живое сохранение.

Контракты: [масштаб и настройки](INTERFACE-SCALE.md), [компоновка и Лудо](LAYOUT-AND-LUDO-FIXES.md). Правила/stateVersion Лудо прежние; изменён view и локализованная справка. Остальные 11 игровых паков и общие ассеты должны побайтно совпадать с RC18 коллекции; проверяется по release-файлам.

## Проверки и публикация

На неизменившемся runtime уже успешно проверены 406 уникальных сценариев по выборке INTERFACE-SCALE и отдельно 50/50 проверок всех мест/поворотов телефона. Дополнительная адресная приёмка RC: case/pwa,case/rc2-games,case/pack-models,case/game-feedback,case/network-feedback-browser — **82/82**, fail/skipped 0 (core 18, input 3, games 32, network 10, PWA 19), exit 0; лог /tmp/rc26-release-check.log. Проверены новые cache-entrypoints масштаба. Самостоятельный check паков: 72 JS, 12 игровых bundles и 18 SHA256, exit 0; лог /tmp/rc19-pack-check.log. Сборки приложения/коллекции, SHA256, ZIP CRC и скачанные release assets проверяются отдельно. Старые красные ограничения RC25 не считаются текущим результатом: новые исправления проходят соответствующие строгие проверки без удаления требований.

Publication workflows получают checks=none, потому что публикуют уже проверенные immutable assets; это не отметка о прохождении тестов Actions. Один новый канал R2 и один новый защищённый Pages preview с обязательными runtime/catalog/protected/offline smoke. API GitHub branch protection вернул 403 (функция недоступна для текущего private-плана); обычные PR/Ready не запускают CI, ручные workflows и фактическая возможность merge проверяются отдельно. Посторонние tooling PR не входят в RC.

Коллекция интегрирована [PR #91](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/91), точный source SHA `887693c5703a4be88bcad01fb0fd000c252273fd`. Окончательные GitHub releases, каталог и защищённый preview опубликованы и проверены; итоговые сведения ниже. На физическом Android приёмка владельца остаётся отдельной от headless Chromium.

## Опубликованные immutable источники

- Приложение: `43405aa4bb67284765c16a01fc752efa6bbffe85`, [PR #169](https://github.com/GraphGiraffe/boardgame-playroom/pull/169), [v0.18.0-rc.26](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0-rc.26).
- Коллекция: `887693c5703a4be88bcad01fb0fd000c252273fd`, [PR #91](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/91), [v0.7.0-rc.19](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.0-rc.19).
- Оба releases — prerelease, не Draft; remote tag приложения разрешён в точный source SHA. Скачанные 8 публичных app-файлов и 18 checksummed pack-файлов проверены по SHA256 и ZIP CRC. App-файлы побайтно совпали с окончательной локальной сборкой. Все остальные 11 игровых JSON, три отдельных asset-архива и общий архив ассетов побайтно совпали с RC18.
- Каталог RC19 опубликован [R2 workflow #39137105830](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/39137105830), success. Канал `0.18-rc.19`; snapshot `437484e2e62cf6a18d943f1f541495d7d1941fa06de7efcc3c1e5aaf2ebb3164`.
- Финальный автономный HTML открыт в Chromium на 390×844 и 844×390: версия RC26, все 12 игр, 19 точек трёх слайдеров, безопасные пределы 120%/110%, без JS ошибок. Снимки настроек `tmp_files/rc26/settings-390.png` и `settings-844.png` просмотрены.

Исходники тегов и assets после публикации не изменялись. Этот отчёт дополняется отдельным документационным commit после проверки deployment.

## Проверенный защищённый preview

[https://283c62de.playroom-hod-test.pages.dev](https://283c62de.playroom-hod-test.pages.dev), deployment `283c62de-b36c-4fc8-b1e6-7c14d6a43bab`. Штатный [Pages workflow #39137352986](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/39137352986) завершился success; отчёт — **preview-verified**, source `github-release`, commit точно `43405aa4bb67284765c16a01fc752efa6bbffe85`, release `v0.18.0-rc.26`, packChannel `0.18-rc.19`.

Protected/runtime/catalog/offline smoke прошёл. Live runtime — app 0.18.0-rc.26 / collection 0.7.0-rc.19, snapshot `437484e2e62cf6a18d943f1f541495d7d1941fa06de7efcc3c1e5aaf2ebb3164`. Все 12 hash/version каталога совпали со скачанными release JSON; Лудо — 0.2.0-rc.9, SHA256 `58e408178dd59516ce53f0050162a085772584b3a8a1912ad26eb8fe5c1438b5`.

`productionUnchanged: true`; productionBefore и productionAfter полностью совпадают: app 0.17.6 / collection 0.6.5. Main refs также прежние: приложение `c07e22e622485d20978bd223e3b2134c4fffd0b2`, паки `f5fbc11925b29a72ad3db7f9edc829c40aa66c5c`. Весь выпуск использовал один R2 run и одну загрузку preview; повторных deployment не было.

Итоговый артефакт `pages-deployment-report` этого запуска скачан в `/tmp/rc26-preview-report/deploy-report.json`; локальная копия — `tmp_files/rc26/deploy-report.json`. Публичные release assets не включают приватную обёртку. Документационный commit с этим итогом не изменяет runtime/tag/asset bytes.
