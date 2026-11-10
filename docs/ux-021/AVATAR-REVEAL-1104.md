# Текущий аватар и общая прокрутка выбора — 4 ноября 2026

Статус: исправлено, проверено и опубликовано во временном превью. Полная GOAL0.21 остаётся открытой.

## Исправление

При повторном открытии выбора аватара текущая поздняя картинка получала focus({preventScroll:true}), но оставалась у невидимого края короткой альбомной панели. Добавление scroll-padding само по себе не решало крайний случай: общее правило panel обнуляло padding, и внизу не хватало реального диапазона прокрутки. В промежуточной проверке Chromium кнопка заканчивалась точно на границе scrollport378px, без места для фокусной обводки.

Общий PlayroomDOM.revealInScrollport теперь раскрывает элемент **по вертикали внутри одного переданного scrollport**, учитывая его border, scroll-padding и масштаб. Он не прокручивает предков и не меняет фокус сам. Подключены общий dropdown и picker аватара; частный расчёт в GameScreen удалён. Для элемента выше высоты scrollport сохраняется начало вместо колебания между двумя краями.

Dropdown и picker аватара используют одно CSS-исполнение inset/scroll-padding6px с достаточной specificity относительно panel. Это реальный padding, поэтому возле крайнего ряда остаётся место. Picker фокусирует текущий физический аватар, при отсутствии такого выбора — кнопку возврата; при выборе картинки раскрывается только его modal-body. Тема, игровые выбранные объекты, правила и native input modality не менялись.

## Проверки

- Существующий `appearance gallery callers retain avatar drafts and invalidate a picker with its source` дополнен выбором последнего настоящего аватара и повторным открытием. До исправления RED: поздний выбор не раскрывается в короткой landscape-панели. Сначала обнаружен устаревший маршрут profile-edit; fixture обновлён на Параметры → Аккаунт → Имя и аватар, этот первоначальный timeout не считается воспроизведением продукта.
- Итоговый avatar-case Chromium1/1 и WebKit1/1 PASS на окончательной PWA. Действительно сфокусирован выбранный avatar ID; вся кнопка находится внутри собственного scrollport с запасом минимум1px. Сохранены черновик имени, обратный фокус, suspended/inert родитель, размеры44–64px в390×844/844×390, отмена и invalidation после смены владельца. Устаревшая кнопка не меняет новый экран или профиль. Прежние строгие проверки не удалены.
- Требование «scrollTop обязательно больше нуля» заменено на фактическое попадание кнопки в видимую область: если сетка помещается в WebKit, прокрутка не нужна. Условие полного попадания с запасом сохранено. Новые вмешательства не засчитывались как PASS до устранения CSS-обнуления padding.
- Общий `select choices reveal current and keyboard options without scrolling the underlying screen`: Chromium1/1 и WebKit1/1 PASS после переноса механизма.45вариантов, текущий35, disabled0/44, Home/End/ArrowUp/ArrowDown, один input/change, исходные scrollTop130 и фокус после закрытия сохранены.
- Просмотрен итоговый screenshot аватаров844×390. Это не визуальная приёмка каждого выбранного аватара во всех масштабах; поздний текущий выбор проверен геометрией.
- git diff --check для итоговых изменений: exit0. Build8SHA256/3ZIP CRC/source248runtime-locale-test файлов совпали. Из230runtime-файлов изменены4: avatar-picker.js,game-screen.js,mobile-surfaces.css,dom.js.226прежних, canonical locales, pack sources и installed companion совпали.

## Превью

HTML SHA256 `751b116c2ee7fcd0c60561298f5f06e984d9f761762ac42530fa482b2115e3f5`.

Cache `playroom-pwa-v0.21.0-preview.1-3c8f675294aeff91`; companion `1e77cfeef4ab31425cc0e93886532db15fbdc14fb997a31ba816c8c3c2a116da`. Разрешённые временные Funnel443/8443 и `/hod-021.html` обновлены. Четыре публичных файла побайтно совпали; standalone проверен полностью64KiB ranges с206/Content-Range/length.

Live Chromium: worker activated, ожидаемые cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Static Funnel по-прежнему не предоставляет `/api/packs/catalog`; его404/offline failures записаны, встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Evidence](../../../tmp_files/ux-021/avatar-reveal-1104/): red.log,old-route-failure.log,avatar-chromium/webkit.log,dropdown-chromium/webkit.log,chromium/webkit screenshots,source-state.json,final-manifest.json,own-changes.patch,executed-appearance.test.cjs,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json.

Это адресное исправление текущего выбора. Полный focus/scroll/scale аудит всех поверхностей, видимость позднего выбранного элемента после поворота уже открытого picker, физические устройства/AT/usability, все игры/роли/сети и производительность остаются отдельными незавершёнными частями исходной GOAL, не перенесёнными автоматически в следующий SDK-релиз.


Последующее исправление: [SELECTION-RESIZE-1104.md](SELECTION-RESIZE-1104.md) подтверждает текущий focus внутри открытого dropdown/аватаров при названных поворотах/размерах текста в Chromium и WebKit. Прежнее ограничение проверки только открытия выше сохранено как описание той итерации, а не текущего evidence.
