# Телефонная правка: акцент, каталог и установка

Текущий артефакт: tmp_files/ux-021/phone-polish-1103/final/playroom-all-games.html. SHA256 `5ee6ecfd8bbc0b6e7b4806b3b71fa2ea94a6c01dbf08cc7ac345448d86354e35`. Приложение0.21.0-preview.1, встроенная коллекция0.8.9-preview.3,15игр.

## Принятые изменения

- [Общий акцент приложения](GLOBAL-ACCENT-ACCEPTANCE.md): мгновенная смена интерфейса и поля, миграция прежнего выбора. Смысловые/игроковые цвета и бежевый/чёрный canvas сохраняются.
- Каталог: крупные обложки, описание в Списке (до1строки) и квадратных2 (до2строк). В compact3 сверху plain тип/число игроков/звезда, по центру обложка, снизу название; нет описания, механики и пустой строки под неё. Внутренний отступ5px,44px hit target избранного сохранён. На квадратах капсула только у механики, в Списке у типа и механики. Каноническое описание уже было в markup, новая копия данных не добавлена.
- [Установленная PWA](INSTALLATION-DETECTION.md): точное installed-related подтверждение заменяет установку на чистую HTTPS-ссылку «Открыть приложение», standalone скрывает оба пункта. Запуск решает браузер по navigation capturing; установленность не симулируется постоянным флагом.
- [Полоска в Оформлении](APPEARANCE-BOTTOM-STRIP.md): ограничены и переносятся длинные подписи цвета, область прокручивается вертикально. Точный default-phone снимок не воспроизведён; подтверждён и устранён overflow на увеличенном тексте.

## Проверки

Appearance unit14/14; PWA install unit6/6; manifest1/1. Source Chromium/WebKit: gallery с12цветами/двумя темами, затем mobile font endcap1/1; каталог1/1 на всех15играх, ширины360/390/430 и6landscape; установка1/1 с явной API fixture, native/manual/iOS/late/fresh invitation/standalone. Ошибки и nativeSupabaseRequests пусты/0.

Root проверил точный assembled HTML: roots/appearance/catalog, по24состояния в Chromium/WebKit, обе ориентации, failures/errors пусты. Canonical build exit0,8SHA256SUMS и3ZIP CRC прошли.230runtime-файлов source snapshot совпадают с source ZIP и текущими исходниками; manifest отдельно совпадает с ZIP. Детали: tmp_files/ux-021/phone-polish-1103/final-manifest.json. Неизменённые правила/сеть/Push/игровой ввод не объявляются повторно протестированными.

По прежнему разрешению временный Funnel443/8443 и /hod-021.html обновлены. Публичные index/SW/HTML побайтно совпали. Новый worker activated с cache `playroom-pwa-v0.21.0-preview.1-0a94f474945aa30c`,15игр/PushManager; native requests0.

Это не штатный релиз, не production SQL и не рассылка. Реальный запуск установленной PWA/исходная полоса на телефоне, DnD на физическом устройстве, Push-доставка и самостоятельная usability-приёмка остаются отдельными открытыми проверками. Общая цель0.21 не завершена.
