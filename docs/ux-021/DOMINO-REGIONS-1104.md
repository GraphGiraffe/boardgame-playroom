# Domino: сохранение компонентов и адресная отрисовка, 4 ноября 2026

Статус: опубликовано разрешённое временное превью; stable-релиз не выполнялся. Это адресная часть цели 0.21; остальные требования GOAL остаются открытыми.

Общие DOM-ключи сохраняют физический контейнер выложенной кости при добавлении к левому краю. Региональные зависимости сохраняют рисунки неизменённых костей, отдельно обновляют доступные цели и состояния управления. Убрано повторное вычисление одной раскладки. Скрытые кости не получают публичной идентичности. Это не доказательство полной миграции сцены на точечные обновления.

Проверенный standalone HTML: SHA256 `fa1e3dced43cafbfc5d5ecaf65d17957b01fa26e469cebffa707154b43ae974a`. Артефакт: `tmp_files/ux-021/domino-regions-1104/final-ready/playroom-all-games.html`. Хеши затронутых исходников и выполненных тестов: `verified-inputs.json` в том же каталоге evidence. После сборки изменены тестовые helpers; соответствие тестов исходному ZIP не заявляется.

## Результаты

- `case/drag-app`, literal name `Domino selection and drag gestures through the real application`: Chromium 11 passed; WebKit 7 passed, 4 native-touch skipped. Проверяется сохранение контейнера, control и SVG выложенной кости при вставке.
- `case/domino-layout`, literal name `Domino snake field keeps the complete chain, real endpoints and seven hand tiles readable on phones`: Chromium 12 passed; WebKit 10 passed, 2 native-touch skipped. Проверены 320/390 px, цепочки 3/7/14/21/28 костей, обратный ряд и двойная кость, реальные команды обоих концов. Native touch доказан только в Chromium.
- Последний layout-прогон: `chromium-layout-current.log`, `webkit-layout-current.log`; оба exit 0. Первый прогон остановился на устаревшем чтении localStorage session, заменённом действующим `PlayroomAppBridge.saveLibrary.current().session`. Проверка половинок использует реальные `[data-domino-half]`, а не отсутствующий CSS-класс.
- `git diff --check` приложения и паков: exit 0. Просмотрен скриншот `chromium-layout/domino-7-320.png`: поле и рука помещаются по ширине, выбранная кость и подсказка видимы.

Реальные телефоны, слышимость, внешняя сеть и вся коллекция этим scope не проверены. Перед публикацией нужны отдельная сверка готовых артефактов/исходников и live PWA; текущая публичная сборка этим отчётом не меняется.

## Опубликованный кандидат

Итоговая папка `publish-ready` содержит тот же проверенный HTML (`fa1e3dced43cafbfc5d5ecaf65d17957b01fa26e469cebffa707154b43ae974a`), с актуальными тестами в source ZIP. Проверены 8 SHA256 и CRC трёх ZIP; из 15 встроенных паков изменился только Domino, из 230 runtime-файлов приложения — только `platform/web/dom.js`. Freeze исходников и отсутствие последующего drift сохранены в `source-state.json` и `final-manifest.json`.

Публичные `/`, порт 8443, `/sw.js` и `/hod-021.html` совпали с локальными bytes (4/4). Live Chromium: новый cache `playroom-pwa-v0.21.0-preview.1-de5bac46521b2435`, 6 состояний, failures/errors пусты, nativeSupabaseRequests=0; service worker и offline Domino/сохранение/профиль проверены существующим runner. Логи и JSON — в каталоге evidence. Это временное PWA-превью, не публикация stable, SQL или R2.
