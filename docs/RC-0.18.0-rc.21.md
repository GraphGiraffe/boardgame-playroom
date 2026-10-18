# RC21: бросок при уменьшении движения

Приложение 0.18.0-rc.21, коллекция 0.7.0-rc.15, канал 0.18-rc.15. Включает все изменения RC20.

Бросок распознаётся и по публичному presentation.type: roll: в Простом режиме Змей одно событие содержит бросок и маршрут. При системном prefers-reduced-motion снимок обычной анимации отсутствует; событие всё равно запускает короткое появление кубика без вращения. instant по-прежнему отключает его.

Адресный браузерный сценарий расширен: ЗиЛ+/Простой/Лудо/Ятзи, четыре скорости и reduced motion. Базовый выбранный прогон RC20 — 124/124; повторяются затронутые сценарии presentation и game-feedback. RC20 и коллекция RC15 уже опубликованы, их файлы не меняются. Итоговый preview будет RC21.

## Проверенная версия

Приложение `ed043f2d44cc4d59a216cbc9fa4f7fdbc7018f00`, [PR #159](https://github.com/GraphGiraffe/boardgame-playroom/pull/159), [v0.18.0-rc.21](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.18.0-rc.21). Коллекция `26f5e8d31258803920a43a01f2de5d5275c6507a`, версия 0.7.0-rc.15.

`case/rc2-presentation-browser,case/game-feedback` — **55/55, без пропусков**; базовый единый прогон RC20 — **124/124**. Все 8 файлов RC21 проверены после скачивания по SHA256 и ZIP CRC. [Публикация каталога RC15](https://github.com/GraphGiraffe/boardgame-playroom-paks/actions/runs/39088363445) завершилась успешно.

## Preview

[https://f1af3375.playroom-hod-test.pages.dev](https://f1af3375.playroom-hod-test.pages.dev), deployment `f1af3375-3eae-4777-b992-c2f4c52d9039`. [Публикация #39088673139](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/39088673139): `preview-verified`, приложение RC21 и каталог RC15 подтверждены; `productionUnchanged: true` (0.17.6 / 0.6.5). Защита доступа/runtime/offline входят в обязательный выпускной smoke. Workflows используют `checks=none` для публикации уже проверенных архивов.
