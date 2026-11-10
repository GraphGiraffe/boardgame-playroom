# Оформление и целые слова при крупном тексте — 3 ноября 2026

Исправлен подтверждённый дефект A28: при системном тексте ×2 в оформлении разрывались «Альтернативные», «Отменить», «Применить» и заголовок. Колонки теперь учитывают размер шрифта, подписи переносятся по словам; кнопки и общая группа действий заголовка переходят на следующий ряд при недостатке ширины. Шрифт не уменьшается. При обычном тексте сохраняются три колонки вариантов и две равные кнопки. Действия44px и игровые выделения сохранены.

Изменены только два runtime-файла: `app/appearance.css`, `app/mobile-surfaces.css`. [Адресная ревизия и исходные RED](../../../tmp_files/ux-021/appearance-text-review-1103/REPORT.md), [независимый просмотр четырёх PNG](../../../tmp_files/ux-021/appearance-text-review-1103/INDEPENDENT-REVIEW.md). Последний содержит ограничения, записанные до завершения интеграционных проверок; их итог ниже.

## Проверено

- Native Chrome defaultFont16→32 и controlled WebKit root16→32,390portrait/740landscape:12состояний на движок, целые слова через DOM Range, intrinsic fit, picker, галочки и footer. Targetcase1/1×2 PASS.
- Существующие common geometry и keyboard tab cases: по1/1×2 PASS; geometry32records/engine, errors/native0. Старые пути Saved→Resume и Accessibility→reduced-motion в самом тесте приведены к текущим actions-sheet и вкладке Эффекты; первоначальные RED сохранены, assertions не ослаблены.
- A26: локальный профиль без облака, отмена и повторное открытие; сохранение имени/перезагрузка и account lifecycle: [точные4selectedPASS и10artifactstates/engine](../../../tmp_files/ux-021/local-profile-review-1103/REPORT.md). В тестах обновлены устаревшая подпись гостевого входа и противоречивое число фильтров.
- Финальный standalone с обычной анимацией:70состояний Chrome +70WebKit, failures/errors/native/sourceDrift0. Это обход затронутых общих заголовков, не полная приёмка всех ролей/ошибок.
- Build exit0;8SHA/3ZIP CRC;230runtime+2canonical locales и4изменённых test sources совпали с sourceZIP. Worker source/manifest сохранены; игровой код и паки не менялись. PWA227файлов,6 098 735байт (+603 к предыдущей).

## Опубликованный кандидат

`tmp_files/ux-021/appearance-text-final-1103/final`, standalone SHA256 `b802641906ca3a5a9c1452414a631522c93f5722e51261d90ae3f13f4aae25be`, cache `playroom-pwa-v0.21.0-preview.1-11569a4aeb5b498f`. App0.21.0-preview.1 / collection0.8.9-preview.3,15игр.

В существующем разрешённом временном Funnel обновлены [PWA443](https://seth.tail6aebd4.ts.net/), [PWA8443](https://seth.tail6aebd4.ts.net:8443/), [standalone](https://seth.tail6aebd4.ts.net/hod-021.html). Четыре публичных bytechecks PASS; полный standalone5 894 864байта проверен по90HTTP206частям64KiB,2параллельно,normalDNS. Живой Chromium: worker activated, точный cache/buildIdentity,15игр,PushManager и downloadProtocol1; errors/native/sourceDrift0. Новую worker upgrade/lifecycle цепочку не заявляем: worker source/protocol неизменны, прежние соответствующие доказательства переиспользованы.

[Машинный manifest](../../../tmp_files/ux-021/appearance-text-final-1103/final-manifest.json) и сохранённые логи содержат точные границы.

## Осталось

Общий GOAL остаётся в работе. Физические шрифты/клавиатура/pinch/AT и самостоятельное обнаружение функций человеком не заменяются браузерными фикстурами. Физический UNO drag/scroll/снятие предвыбора, Push permission/delivery, реальные signed-in/RTC/сети и полный набор ролей/паков остаются отдельными gates. Очень длинные слова без пробелов и все владельцы общего заголовка отдельно не проверены.

Четыре ранее разрешённых серверных SQL уже применены,19/19; [серверный отчёт](LIVE-SERVER-ROLLOUT-1103.md). В этой UI-итерации БД/Edge/config/cron не менялись, реальные Push и объявления не отправлялись. Стабильные Pages/R2/Cloudflare не публиковались.

ROADMAPler: `ux-021-full-audit`, revision368, statuswork; описание дополнено с сохранением истории, readback подтверждён.
