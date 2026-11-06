# Эксперимент: измерения предков в motion capture — 4 ноября 2026

Статус: вариант проверен и отклонён для текущего runtime. Исходники motion и его теста точно восстановлены к опубликованному кандидату; превью не менялось. Экспериментальные исходники/артефакты/профили сохранены. Полная GOAL0.21 открыта.

## Проверенная гипотеза

`capture` для каждой карты заново читал computed style общих предков и складывал их повороты. В расширенном существующем Arc-pose scenario общий контейнер руки читался7раз в одном capture. Эксперимент ввёл локальные WeakMap styles/angles, существующие только внутри синхронного capture; публичный poseOf оставался свежим. Повторное чтение того же исходного rect при построении entity pose также исключалось.

Новый RED показал7≠1. Экспериментальный GREEN показал1чтение; второй capture после поворота родителя9° создал свежую measurement epoch, сохранил итоговый угол карты2° и размеры66×98. Это уменьшение числа вызовов, а не доказательство ускорения пользовательского действия.

## Что проверено на варианте

- `case/motion-effects`: Chromium20/20 и WebKit20/20 PASS. Существующие privacy/frozen artwork/stock aspect/flip/SVG/foreignObject/rotation/cancel/cleanup assertions сохранены; Arc-pose case дополнен счётчиком и сменой epoch. Существующий CSS-набор клона не сокращался.
- `case/solitaire-input --name 'screen:phone solitaire touch applies immediately at normal animation speed'`: Chromium1/1 PASS, настоящий native input/source renderer и normal-animation stock/ход.
- `case/solitaire-input --name 'screen:phone real solitaire renderer picks up the entire exposed group on touch down at 50%'`: Chromium1/1 PASS, Klondike stack/отмена/законный commit. Эти CDP-source сценарии не названы WebKit/iPhone проверкой.
- `case/network-feedback-browser --name 'opponent UNO +2 and +4 reveal from the opponent hand before the local penalty draw'`: Chromium1/1 и WebKit1/1 PASS. Это controlled projection/provider presentation, не настоящая сетевая игра.
- Экспериментальный build:8SHA256/3ZIP CRC/source250 сверены; другие229runtime и все15паков совпали с текущим превью. Выбранный actual HTML performance run успешно завершил move0→1 с busyfalse/errors[]. Эти проверки относятся к эксперименту, не к новой опубликованной сборке.

## Почему отклонён

Существующий controlled Spider seed17 сценарий запущен до/после без параллельных браузерных нагрузок. Совпали browser/version, viewport740×390, CPU1×, sampling1000µs, fixture SHA, исходный state SHA, действие, rect/point цели и normal340ms. `comparison.json` фиксирует эти равенства.

| Замер | До | Эксперимент |
|---|---:|---:|
| Long task выбранного хода | 72мс | 75мс |
| Чтений общего контейнера в отдельной регрессионной позиции | 7 | 1 |

Разница72→75мс одного эпизода не доказывает устойчивую регрессию; ускорение также не подтверждено. Сокращение getter calls не устранило задержку и не оправдывает добавленный кэш в текущем релизе. Это не статистика INP/FPS и не физический телефон.

`core/motion.js` восстановлен из заранее сохранённой точной копии, совпадающей с published source SHA. Из `tests/motion-effects.test.cjs` удалён только экспериментальный добавленный блок; полное совпадение восстановленного файла с прежним source ZIP проверено перед записью. Сторонние изменения не сбрасывались. Итоговая сверка отслеживаемых runtime/locales/testFiles/packSources — drift0. Оба экспериментальных исходника сохранены как candidate-motion.js и candidate-motion-effects.test.cjs; новая строгая норма1чтение не оставлена в рабочих тестах для отвергнутой реализации. Успешные неизменённые проверки восстановленного кода не повторялись.

## Текущая поставка и продолжение

Публикация не выполнялась. Текущий HTML остаётся `a7eb2bba41840ae83671052f2b20b8afc7db007c70b2ff9e61b953913eac1181`, cache `playroom-pwa-v0.21.0-preview.1-44581c31451e4cc8`. В `final-manifest.json` эксперимента явно `published:false` и `status:rejected-performance-unproven`; папка с именем `final` не означает current preview. Проверки TLS/PWA на неизменных байтах повторно не запускались. SQL/R2/службы/подключения/пользовательские данные не менялись.

[Evidence](../../../tmp_files/ux-021/motion-read-batch-1104/): before-profile/after-profile, comparison.json, before-motion.js,candidate-motion.js,candidate-motion-effects.test.cjs,red.log,motion-chromium/webkit.log,spider-native.log,klondike-native.log,uno-chromium/webkit.log,final-manifest.json,source-state.json,restored-source-drift.json. До/после профили использовали точные разные HTML SHA, указанные в их clean-result.json; существующий runner/fixture не заменялся новым генератором тестов.

Остаточная длинная задача и обычный полный внешний recipe/прочие обходы остаются открыты. Уменьшение небольшого числа повторных чтений не подменяет требуемый точечный пересчёт всей коллекции и не переносит эту задачу0.21 в будущий SDK. Физические устройства/AT/слышимость и независимая usability также не закрыты.
