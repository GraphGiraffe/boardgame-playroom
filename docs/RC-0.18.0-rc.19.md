# RC19: прокрутка жетонов эффектов

Приложение 0.18.0-rc.19, коллекция 0.7.0-rc.14, preview-каталог 0.18-rc.14. Production не меняется.

Строка счётчиков и отложенных эффектов не переносится. Если жетоны не помещаются, она прокручивается горизонтально, сохраняя высоту карточки. Плотная рассадка сохраняет прежние размеры. Общий механизм работает во всех паках; явных игровых действий с allowLayoutChange пока нет.

Основа: RC18, 343/343 основных проверок; после исправления слоёв — 45/45. В коллекции RC14 клетки и цели ниже змей/лестниц, фишки выше всех. Дополнительный выбранный прогон RC19: case/rc2-presentation-browser, включая неизменность размеров карточек при появлении эффектов, прокрутку, снимки 320/390/844 px и общую матрицу всех 12 игр.

## Проверенная версия

- Приложение: `e079901a7e8014fd16cf2a52d65c44ae5b6cad9a`, [PR #156](https://github.com/GraphGiraffe/boardgame-playroom/pull/156), [v0.18.0-rc.19](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0-rc.19).
- Коллекция: `8a73cfa0443b3e5a92316fdf3c382d41be26f43c`, [PR #85](https://github.com/GraphGiraffe/boardgame-playroom-paks/pull/85), [v0.7.0-rc.14](https://github.com/GraphGiraffe/boardgame-playroom-paks/releases/tag/v0.7.0-rc.14).
- Итог RC19: 46/46, без пропусков. Снимки `tmp_files/rc2-presentation/rc19-effects-{320,390,844}.png` просмотрены; карточки не растут, переполнение прокручивается. Это браузерная проверка указанных размеров, не проверка каждого физического устройства.
- Все 8 файлов приложения и 17 файлов коллекции проверены после скачивания по SHA256, ZIP CRC совпали.
- [Публикация каталога RC14](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/39049086819): success. Production-каталог не изменён.

## Preview

[https://d79a48d4.playroom-hod-test.pages.dev](https://d79a48d4.playroom-hod-test.pages.dev) — deployment `d79a48d4-d89c-47cf-b546-e327a3816199`. [Публикация #39050623519](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/39050623519): `preview-verified`, точные SHA/версия приложения и 12 паков подтверждены. `productionUnchanged: true`: приложение 0.17.6, коллекция 0.6.5. Выпускные workflows использовали `checks=none` для публикации уже проверенных архивов.
