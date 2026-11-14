# Поверхности, игровое меню и уведомления0.21 — 02.11.2026

Приоритет — последние инструкции владельца и связный prototype-v1. Прежние
семь равных tools и иконки в legacy toolbar заменены; их ранние скриншоты
не являются visual acceptance.

GameScreen.classifySurface выбирает screen/panel до вставки shell. App и shared
network dialogs передают data-ui-surface сразу. Длинные reading/settings/library/
account поверхности — экраны; короткие context/choice — panels. Game-chat-panel
остаётся вытягиваемой панелью, не fullscreen.

## Игровое меню и frame

app/game-menu.js и отдельный game-menu-021.css:4 основных пункта «Лобби»,
«Правила», «Настройки», «Остановить партию» с существующими правами. Редкие история,
пауза, fullscreen и «На главный экран» в одном «Дополнительно». Кнопка возврата
закрывает overlay. Portrait — нижняя панель с handle/pull-down; landscape — правая.
Overlay сохраняет scene DOM/размеры, только явное открытие временно ставит app inert;
закрытие восстанавливает focus/inert. Исходные command/network quickshortcut attrs
сохранены, home паркует активную сетевую партию прежним маршрутом.
Stop — прежний authoritative stop-match.

Frame содержит title+menu и fieldtoggle только когда он нужен. В landscape
header/status зарезервированы слева, не закрывают правую руку или поле. Общую
геометрию для всех паков ведёт родительский layoutScene; специальных offsets для
Domino/Mage здесь нет. Удалены obsolete canonical blocks: player header static flow
и table-status display:contents. Последний реально уменьшал WebKit поле.

Повторный /tmp/hod-frame-unified.cjs после удаления display:contents:
Финальный clean frame /tmp/hod-frame-details.cjs: Domino/UNO/Tictactoe×4viewports,
Chromium12/12 и WebKit12/12 PASS
(844×390/932×430/390×844/return). Header:absolute64px (tools44+title18+gap2),
status:flex/absolute28px top72. Поле844×390: x119 y13 364×364, self342×364;
при932×430 поле404×404. Название Домино целиком, длинные строки с явным ellipsis. Ранее WebKit y51.39 height325.6. Нет horizontaloverflow.
Парные PNG/measurements: tmp_files/ux-021/frame-unified/{chromium,webkit}-*.
Общие pack metadata вынесены в отдельный status track под participants,
chips укладываются вертикально без left clipping. Пустой host track сохраняет88px
и не конкурирует с metadata. Field/self span и landscapeZones не изменены.
Парные final Domino PNG просмотрены. Это frame/геометрия, не все механики15паков.

case/game-screen23/23 PASS; semantic assertions проверяют room/results в menu
mapping, а не возвращают лишние header buttons. Result rematch называется «В лобби»;
немедленная локальная «Ещё партию» — отдельный optional rematch-start. Saved-card ⋯
оставляет primary продолжение видимым, раскрывая secondary actions.

/tmp/hod-game-menu-inspect.cjs: actual local clicks/Rules, no scene remount,
inert restore, no overflow. Последние composition PNG:
fidelity/application-gamemenu-chromium-{390,844}.png. Ранние Chromium/WebKit
семиинструментальные PNG — только behavioral evidence прежнего этапа.
Текущий realRTC scenario дополнительно проверил owner/non-owner Stop и actual Stop.

## Входящее предложение хоста

host-transfer-ui.js presentation + host-offer-021.css: receipt создаёт пассивный
верхний banner без блокировки игры. Tap или Push focusIncoming(id) открывает
короткую overlay panel с явными принятием/отказом. Escape/X закрывают панель,
сохраняя предложение; отказ/канальная отмена чистят promise/UI. Фокус возвращается,
когда пользователь был в панели, без захвата при отмене во время игры.
Backend guard кодера ждёт единый consentResult включая cloud accept: дубликат
не считается согласием до ответа; prepare/activate до accepted запрещены.

После security freeze настоящие RTC-проходы8+3checkpoints PASS, errors[]:
tmp_files/ux-021/final-ui-rtc/report.json и final-ui-rtc-consent/report.json.
Покрыты lobby/play handoff spectator↔player, draft rotate/shrink/reopen,
message/reply/attached reaction, settings reset+Back exactscene/room/channel,
explicit decline/focus, panel close/reopen и RTC cancel.
Push entry вызван сценарием напрямую, это не доставка native Push.

## Остальные компоненты и пределы

Social swipe actions: непрозрачная скруглённая front row,44px ⋯, reduced-motion;
исправлены белые полосы, community-actions-browser1/1 PASS. Participant actions
сброшены с legacy icon widths в полноширинные menu rows, устранено перекрытие чата
и удаления. Общие resource indicators — StatusMeter (scope в FINAL-UI-ACCEPTANCE).
Родитель исправил реальный порядок script: status-meter до pack-manager/cloud-saves-ui;
Node unit не подтверждает browser script ordering. Это не скрывается fallback.

Финальная визуальная приёмка всех экранов ещё не завершена. Physical iOS keyboard,
safe areas, native Push/Back,8участников и все игровые анимации этими проверками
не подтверждены. Публикации/рассылки не было.
