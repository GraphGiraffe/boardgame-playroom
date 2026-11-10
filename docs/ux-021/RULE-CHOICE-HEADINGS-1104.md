# Название параметра без скрытой справки в заголовке выбора

4 ноября2026. Физические скриншоты показали крупный жирный текст«ПорядокОбычный порядок…» и аналогичную склейку для«Игрок №1»/«Выход после3неудач».

Причина: общий openSelectChoice читал textContent первого span подписи label. В setting-title находятся не только название, но и rule-help с скрытым popover. Для wrapped-title справка может быть вложена даже в setting-title-text. В результате скрытый текст становился частью modalHead и aria-label группы выбора.

Теперь сохраняется приоритет явно переданного title/aria-label; иначе берётся связанная label и копия её заголовка, из которой исключаются вспомогательные controls/иконки/rule-help/popover. Реальная подпись и справка не изменяются. В панели остаётся название параметра, а справка доступна в исходном«?». Учитывается и label[for] через select.labels. Игровые значения, настройки и стили текста не подменяются.

RED в существующем select-choice case воспроизвёл полную строку«Порядок?Обычный порядок…» вместо«Порядок». После исправления тот же case1/1 Chromium+1/1WebKit: чистое название/group aria-label, текущая опция35из45, keyboard navigation, поворот/узкий экран, неизменная прокрутка основы и возврат фокуса. Логи rule-choice-title-red/chromium/webkit-1104.log в tmp_files/ux-021.

Готовый HTML проверен существующим A08 Ludo teams case, усиленным тремя настоящими dropdown: seatOrder, firstPlayerMode, option-guaranteedExit. Каждый заголовок точно совпадает с кратким названием, не переполняет панель; выбор текущей опции не меняет значение и принятые правила, исходная справка сохраняется. Прежние save/invalid-settings/roster проверки не ослаблены. По1/1 обоих движков. Скриншоты и choices.json — tmp_files/ux-021/rule-choice-title-1104/{chromium,webkit}/. Просмотрен Chromium firstPlayerMode.png.

Опубликовано временное превью: HTML `a6501bb6649a67914d7b92266ed6162375359aec1a15fdba03164ca5ac716799`, cache `playroom-pwa-v0.21.0-preview.1-a5d6fbd95771ebd1`. Из230runtime изменён только app/game-screen.js; все15паков прежние. Build8SHA/CRC3ZIP/source254/public4/livePWA-offline6states PASS, source drift0. Итоговые manifests/logs — tmp_files/ux-021/rule-choice-title-1104/. Реальные телефоны/AT не объявлены проверенными; общая GOAL остаётся открытой.
