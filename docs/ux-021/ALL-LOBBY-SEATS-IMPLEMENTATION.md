# Лобби: все места и явная нумерация

Последнее указание владельца заменяет прежний агрегированный вход «Добавить
участника»: теперь видны **все** места, включая свободные и закрытые, в
компактной сетке из двух колонок. Изменены только `app/lobby-view.js` и
`app/lobby-021.css`, существующий browser companion и этот отчёт.

- Сетка сортирует канонические `room.seats` по `seat.index`, не по составу
  участников и не по выбранному первому игроку. Номер — index+1; палитра берётся
  из общего Multiplayer.seatColor / UI avatar. В пустом месте тот же номер и
  цвет, в занятом — номер рядом с аватаром и прежняя личность/готовность.
- Целая карточка открывает существующую панель места либо участника/бота.
  Существующие room/drop/claim/role/ownership hooks не заменены. Закрытое место
  видно владельцу; клиенту оно остаётся недоступным по прежним условиям.
- Зрители и «Стол» находятся отдельным полноширинным списком вне сетки мест.
  Настройки комнаты, правила и параметры игры сохраняют свои входы.
- Подпись первого хода показывает реальный номер выбранного места. После тапа
  жетона выбирается занятое место по participant ID: человек или бот. Пустое
  место не назначается и не открывает другую панель; Escape отменяет выбор.
  Обычные нажатия участников после назначения снова открывают их панель.

Existing `Unified lobby exposes…` и `Network lobby keeps role changes…`:
**Chromium 6/6 PASS, WebKit 6/6 PASS**. Первый покрывает 360×740, 390×740,
740×390, 1440×900, all-slot order/numbers, две колонки, occupied/empty/closed,
бота/локального участника, первый ход и устойчивость native lobby DOM/scroll.
Второй сохраняет синтетические RoomService role/claim/public projection guards.
Повтор первого только для запрошенных initial/closed captures: по5/5 обоими.
Сетевой RTC transport этим проходом заново не сертифицировался.

Для компактной сетки short-touch scroll проверяется в reduced viewport 360×430,
где действительно есть содержимое для прокрутки: native CDP touch в Chromium,
controlled PointerEvent scroll lane в WebKit. Native iPhone/Android gestures
остаются физической проверкой. Старый A08 `.details` assertion обновлён по
параллельной принятой структуре: direct Order/Parameters sections, тот же
firstPlayerMode SELECT и Save.

Логи: `tmp_files/ux-021/all-lobby-slots-{chromium,webkit}.log` и
`all-lobby-slots-final-{chromium,webkit}.log`; PNG:
`tmp_files/ux-021/all-lobby-slots/{chromium,webkit}/room-seats-{initial,closed}-390.png`
и `room-host-{360,390,740,1440}.png`. Current closed390 Chromium capture
просмотрен: шесть видимых пронумерованных мест, две колонки, читаемые статусы
и fixed primary action; root/background/modal не просвечивают.

Source freeze: lobby-view.js `dcd4a9917c0c311afe592657869e4f6fbca022865c19da6600d4d4a7bcc371d6`,
lobby-021.css `727df134ae6d76f1c4f9e55a74fa7e9107b65a73673dc63728700e264c58c967`.
App.js, RoomService, game rules/protocol и production не менялись.
