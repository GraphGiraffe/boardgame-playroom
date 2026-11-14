# Нижняя полоса во вкладке «Тема»

Локальная CSS-правка заморожена. Native gallery case: Chromium1/1 и WebKit1/1, оба exit0. Сборку и публикацию выполняет root.

## Что установлено

Hidden footer и status/error не являются источником видимого блока: оба имеют нулевой layout; footer0×0. Точная полоса с физического скриншота **не воспроизведена** на стандартных Linux fonts ни текущего source, ни опубликованной PWA. Эта граница сохранена, а не подменена искусственным воспроизведением телефона.

Найдено реальное intrinsic overflow названия «Терракотовый» в пятиколоночной палитре. При обычном размере оно пока помещалось в6px padding section; при контрольном14px label endcap (то же настоящее название) section шириной352px получал scrollWidth361px. Wide span заканчивался в377.21875px при правом крае section368px. Scrollport разрешал обе оси через overflow:auto, что создавало реальный горизонтальный диапазон9px и возможность почти полноширинного scrollbar thumb. Это проверка границы размеров текста, **не доказательство конкретных настроек шрифта пользователя**.

## Изменение

Длинные названия цветов ограничены своим control: min-width:0, max-width:100%, overflow-wrap:anywhere. Это устраняет переполнение содержимого, а не скрывает выходящий текст. Секции gallery используют vertical-only scroll: overflow-y:auto, overflow-x:hidden. Общий focus padding6px не изменён, focus остаётся внутри scrollport.

Accent API, palette colors, appearance-ui.js и функции применения/отмены не менялись. Существующие root accent assertions полностью сохранены.

## Приёмка

Тот же existing case `appearance gallery 0.21 owns its draft and preserves settings, scene and foreground lifetime` запускается с native mobile context384×832. На время endcap label получает14px, после проверки исходный style восстанавливается. Проверяется352/352 вместо352/361, отсутствие wide nodes, отсутствие горизонтального диапазона, label.scrollWidth внутри самого control и границы label внутри кнопки. Это исключает простое маскирование текста overflow:hidden.

В обеих engine также прошли прежние проверки global accent/all hues, контраста, бежевого/чёрного canvas, sticky game chooser и места под focus outline, component labels, rank10 art, Apply/Cancel, сохранения native parent focus/scroll/scene/revision и stale foreground ownership. Other cases и whole suite не запускались.

Артефакты: `tmp_files/ux-021/appearance-bottom-strip/final-manifest.json`, `chromium-endcap-red.log`, `{chromium,webkit}-green.log`, `endcap/` и `green-{chromium,webkit}/` с DOM metrics и PNG. В manifest явно указано происхождение восстановленных pre-fix CSS/test snapshots и проверены итоговые source hashes/сохранённые accent assertions.

Source CSS SHA256: `e4633adb61092802053c0891a5262a6de93ce79a3cd60df55e44962584fe52b5`. Test SHA256: `e5d8279767d13b05b492ae5f809e457669b121f1dc3898d8fac7287f9fcfae92`. Physical device confirmation остаётся отдельным шагом root/user.
