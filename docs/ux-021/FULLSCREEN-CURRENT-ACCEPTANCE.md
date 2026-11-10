# Полноэкранный режим и прокрутка 0.21

Старый browser case использовал удалённые topbar/settings-toolbar/manualscale.
Его прежний PASS не подтверждал новый интерфейс. При ревизии выяснилось, что
после удаления старой toolbar вход из Hub пропал; игровой fullscreen сохранился.

В «Настройки → Доступность» добавлена обычная подписанная строка «На весь экран»
на общем menu-row. Она вызывает прежний fullscreen command; aria-pressed и подпись
синхронизируются с реальным native/fullscreen-fallback состоянием, включая
fullscreenchange. Никакого ручного масштаба или новой toolbar не добавлено.

Existing `case/history-library-layout-browser --name 'hub fullscreen fallback preserves'`:
Chromium1/1 и WebKit1/1, skip0. Мобильный touch context390×844/844×390; настоящий
requestFullscreen контролируемо отсутствует, как на неподдерживающем его браузере.
Для «Игр» и18сетевых сохранений «Моих партий» проверены обе смены режима,
document scroll200→400→250, общий modal scroll lock/его снятие и видимая root
навигация. Дополнительно проверяются active destination и сохранённые настоящие
карточки; PNG снимаются после конечного состояния браузерных анимаций. Первые
кадры, поймавшие переход через промежуточную страницу, сохранены отдельно
в before-transition-settle и не считаются визуальной приёмкой. Всего4состояния на движок, pageerrors[], nativeSupabaseRequests0.
Network-library список здесь fixture, не18настоящих сетевых подключений.

Артефакты: tmp_files/ux-021/fullscreen-current/{chromium,webkit}-report.json,
4PNG каждого движка и source.sha256. WebKit запуск использует
PLAYROOM_TEST_BROWSER=webkit и локальный browser bundle. Native Safari chrome,
реальный системный fullscreen/Back и настоящая OSkeyboard этим не подтверждены.
CSS fallback не обещает скрыть адресную строку браузера или установить PWA.
