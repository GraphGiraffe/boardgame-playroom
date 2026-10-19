# Выпуск 0.18.1 / 0.7.1

Пара выпуска: приложение **0.18.1**, коллекция **0.7.1**, engineApi 3 / viewApi 2 / protocol 2. Факт публикации подтверждают записи GitHub Releases, скачанные assets и protected production report. Точные main SHA и companion pair записываются в README-TEST.txt артефактов.

- [Приложение и SDK](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.1).
- [Коллекция](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.1).
- [Сайт](https://playroom-hod-test.pages.dev).
- [Состав патча и проверки](PATCH-0.18.1.md).

## Изменения

Компактные смысловые блоки правил, два дискретных слайдера в строке, короткие названия и значения. Колоды остаются списками. Рыба: 36/52; Акулина: 35/51 в интерфейсе, исходные ID 36/52. Завершение внизу; безлимитная позиция ∞ последняя. «Игрок №1» и «Порядок» наверху, радио-кнопки компактнее.

Рука (Прямо/Веером) и рассадка выбираются слайдерами. Справки «?» находятся у названий; Escape закрывает только справку. Контуры фокуса повторяют форму контролов; у справки кольцо имеет общий центр с SVG-иконкой.

Тесты правил, настроек и справок выделены в малые case; типы screen:phone:portrait / screen:phone:landscape фильтруют отдельные сценарии. Старые большие файлы поддерживают case/… --name; пустой фильтр не считается успешной проверкой.

## Проверка и совместимость

Для UI-патча выбран `node scripts/codex/test.cjs screen:phone,core/test-selection`, без полного игрового цикла. Коллекция отдельно проходит syntax/build/SHA256. Сборки выполняются из окончательных main SHA; проверяются ZIP CRC и SHA256 локальных и скачанных опубликованных файлов, protected runtime/catalog/offline. Физические Android/iOS остаются ручной приёмкой.

Правила, RNG, privacy и stateVersion не меняются. Старые exact-version паки, сохранения, теги и bytes не переписываются. Origin, защита и R2 binding сохраняются. Публикация коллекции и приложения независима.

Предыдущая стабильная пара: [app 0.18.0](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0) / [packs 0.7.0](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.0). Она остаётся точкой отката; сквозной source gate этого базового выпуска был 1004/1004. Планы новых игр/скинов остаются спецификацией. Процедура — [RELEASING](RELEASING.md).
