# Телефонная ревизия 3 ноября: общие исполнения и накопленные правки

## Реализовано

- Общие `GameScreen.pageTabs`/`parameter-screen-content`/`parameter-screen-tabs` подключены к Настройкам, Оформлению, Данным и Аккаунту; сохранены роли, связывание панелей и обработчики. Типы поверхностей, заголовки, иконки, основные/строчные действия используют существующие общие механизмы. Контракт: COMPONENT-STANDARDS.md.
- Справка у длинного названия переключателя привязана к последнему слову и не меняет настройку. «Меньше движения» и скорость синхронизированы в обе стороны без пересоздания полей. Модальный enter одноразовый: возврат normal motion не сдвигает уже открытый экран.
- Участники группы сохраняют строки/высоту при Back, обновлении и временной ошибке. Данные account/service/generation scoped; быстрый Back/reopen делит1RPC; права перепроверяются, поздний отзыв доступа очищает snapshot, смена аккаунта не раскрывает старый список.
- Обновление Общения в быстрых действиях заголовка, без большой отдельной кнопки.
- Тема и локальный цвет поля применяются сразу. Быстрый переключатель темы на главном экране. Палитры из12цветов мест игроков, зелёная по умолчанию; бежевый/чёрный фон, текст и цвета физических сторон не подменяются.
- В Оформлении удалена поясняющая подпись и отдельная вкладка Арты. Общие вкладки Тема/Компоненты сохраняют настоящие варианты оформления, включая некарточные; игры без выбора скрыты. Выбор игры закреплён, фокус не обрезается.
- Классические → Альтернативные → Крупные, подпись цветов второй строкой; выбор поверх образца. Номиналы10 проверены внутри скруглённой печатной области и существующего окна перекрытия, исправлена каноническая геометрия общего SDK; host copies сгенерированы штатно.
- В Данных Устройство/Облако действия обслуживания сразу открыты. Внутренний выбор экспортируемых партий остаётся отдельным блоком.
- В каталоге виды/В комнату перед Все/Любимые/Фильтры; редактирование в заголовке. Метаданные сверху как в старой карточке: иконка типа, число игроков, подпись механики; избранное справа сверху. Один canonical helper для видов. Иконки типов в фильтрах, «Карты» из canonical tags; шестерёнка проще.
- Из видимого статуса партии удалены Ваш ход/Показываем ход и другие меняющие ширину фразы. Остались round/turn/event и индикатор фиксированных8px с доступным названием.
- Отдельно исправлено измеренное смещение игрового drag ghost на ПК: координаты приводятся к фактическому fixed-origin один раз при lift, без констант и дополнительных layout reads на каждом move. Телефонное «пропал DnD» не воспроизведено: actual touch работает на точной старой и новой сборках; уточнение пользователю отправлено. Это исправление alignment не выдаётся за найденную причину его телефонного сбоя.

## Проверки

| Scope | Доказательство |
|---|---|
| Модальные движения | RED x10→34 на старом окне, GREEN x10→10; existing case по1/1 Chromium/WebKit, interrupted enter, app/system reduce, Back/out/reopen, точные узлы/фокус. REDUCED-MOTION-ENTRY-LIFECYCLE.md |
| Настройки | Existing artifact driver:8кадров/движок; help readonly рядом с последним словом, motion slider/switch связаны, DOM не перемонтирован. settings-phone-fixes/shared-green |
| Группы/общение |3selectedcases×2движка; held RPC,503/retry, account/revoke, root/standalone refresh, native requests0/errors[]. GROUP-MEMBERS-CACHED-REFRESH-1103.md |
| Оформление/SDK | appearance14/14 +mini-split1/1; finalgallery по1/1 Chrome/WebKit; numeric Settings geometry, immediate apply, drafts/scene ownership, safe rim/peek обеих font metrics. tmp_files/ux-021/appearance-instant |
| Данные | Existing real archive download/import +503retry по1/1 Chrome/WebKit; пункты открыты и390/844overflow отсутствует. tmp_files/ux-021/data-actions-1103 |
| Каталог/иконки | Existing selected case по1/1 Chrome/WebKit:15типов/иконки/порядокстрок/list2rows/2&3square/art>=24/44pxfavorite. tmp_files/ux-021/catalog-metadata-1103 |
| Игровой drag | exactoldPWA/currentCDPtouch/RTC +WebKitmouse по1/1, UNO13/13; NATIVE-GAME-DRAG-ACCEPTANCE.md. Физический missing-DnD остаётся неподтверждённым. |

На точном финальном standalone HTML каждый движок снял50состояний затронутых экранов без page errors/внешних Supabase-запросов. Первый driver в game случайно вызвал пробный render после старта и перезаписал presentation action registry, поэтому меню не имело Stop. Пробный markup-contract перенесён до настоящего старта; **только** game chain повторён: по18состояний, failures/errors/nativeSupabase0. Предыдущие50кадров сохранены, их game failure не скрыт. Полный игровой участок теперь проверяет и8pxиндикатор, и настоящее меню/Stop/Cancel.

В отдельном CLI account case прежний мгновенный count захватывал уходящий inert modal; assertion переведён на active root +terminal detach. Два запроса повторного CLI-запуска не начались из-за таймаута автоматического согласования. Доступная безопасная альтернатива — точный artifact UI route: все3формы/ARIA id/sharedtabs и сохранение native drafts прошли обоими движками; этот scope не объявляется полным новым прогоном всех auth/provider сценариев.

## Артефакт

`tmp_files/ux-021/phone-review-1103/revision2/final/` — приложение0.21.0-preview.1 и bundled companion0.8.9-preview.3 с15играми. PWA cache `playroom-pwa-v0.21.0-preview.1-6e04eaa45e340d3d` уникален по содержимому; одинаковый номер preview не перезаписывает активный кеш. Штатные update-механизмы и IndexedDB не менялись.

- Standalone SHA256 `1632e19c51c9f140cd2ec8c8e53343bd2def05308c51e8df88f2d8de9e456494`.
- PWA index SHA256 `108feee2a2054e17405f311168e07197e3f78d1919ab30944b450670b4533d48`.
- SW SHA256 `a417b2fbe6b3c32abb55dc786dae687fa3f1b5b62357c61389f54fe97c538d1f`.

Canonical app build/8SHA/3ZIP CRC; paks build/27SHA/12ZIP CRC корректны.230runtime files побайтно совпали с source ZIP; source-state.json рядом. Pack tags/asset catalog/SDK обновлены в canonical источниках, host/generated registries штатно синхронизированы; compiler hash/протокол/правила/masters не менялись. Ничего не опубликовано в immutable R2/Pages/Cloudflare release.

По ранее данному явному разрешению полная PWA обновлена в корне Funnel443/8443; /hod-021.html ведёт на этот standalone. Публичные root/sw/push-worker совпали с build побайтно по прямому публичному IP. Физические клавиатура/HomeScreen/Push/удобство новым пользователям и исходный телефонный DnD не считаются принятыми; GOAL остаётся активным.

Живая опубликованная PWA проверена отдельным Chromium без прокси процесса: terminal activated, точный cache6e04eaa45e340d3d,15игр, PushManager доступен;2кадра, failures/errors/nativeSupabase0. Это готовность службы, не оформленная реальная подписка/доставка. Отчёт revision2/live-pwa/chromium-report.json.
