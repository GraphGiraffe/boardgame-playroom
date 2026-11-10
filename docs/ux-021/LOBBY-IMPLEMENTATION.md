# Лобби0.21 — структурная реализация, 02.11.2026

Текущий runtime повторяет композицию выбранного connected prototype-v1.
Прежняя миграция старой сетки с подписями заменена новым markup `room-v021` /
`app/lobby-021.css`; она не является визуально принятой. Старые lobby.css rules
не применяются к новому корню; прежний компенсирующий блок mobile-surfaces удалён.
Игровые данные и authority не переписаны.

Порядок: Back/title/help → summary с art, названием, тихими mode/code/host и
«Правила» → «За столом» → компактные person rows → одна строка «Добавить участника»
с реальным количеством свободных мест → «Пригласить» → Автостарт → причина ожидания
→ «Доступ и настройки» → фиксированная готовность. Отдельных mode controls,
постоянных chair/type buttons и slots grid нет.

Целая строка человека открывает participant panel, бота — bot editor, свободного
места — явный выбор назначения. Зритель/Стол используют ту же person row.
First-player/team markers и быстрые реакции своего аватара сохранены. Все фактические
свободные/закрытые места доступны в контекстной панели; дополнительная компактная
строка соответствует реальным данным, не подменяет их демонстрационным reference.

«Доступ и настройки» получает свежий authoritative context через LobbyView,
сохраняет hooks имени комнаты, редактора правил, выбора игры, чата, ролей, stop/leave.
Чтение правил и настройка правил — разные действия. При автостарте одна главная
готовность и реальная причина ожидания; ручной Start доступен при autoStart=false
или local play. Зритель и Стол не получают readiness CTA.

Свидетельства:

- `/tmp/hod-room-fidelity-runtime.cjs`:390×844/844×390, настоящая local roomService
  с явно заданными bot/spectator test data;0 mode radios,0 type buttons,3 person rows,
  footer вviewport, нет горизонтального переполнения. Actual Rules/Back,
  Addparticipant→explicit choice, Доступ→context panel. PNG
  `tmp_files/ux-021/fidelity/application-lobby-{390,844}.png` рядом с нормализованным
  `reference-lobby-{390,844}.png` дизайнера.
- `/tmp/hod-final-ui-rtc.cjs` после backend security freeze: два настоящих RTC-клиента,
  spectator handoff в лобби, owner-only Stop, handoff обратно во время партии,
  actual Stop возвращает обоих в лобби. Сброс настроек/Back сохраняет scene/room/channel. `final-ui-rtc/report.json`,8checkpoints PASS,
  `errors: []`.
- `/tmp/hod-final-ui-consent.cjs`: пассивный banner, явная панель, Escape сохраняет
  предложение, отказ возвращает фокус, RTC cancel очищает promise/UI.
  `final-ui-rtc-consent/report.json`,3checkpoints PASS, `errors: []`.

Проверки360/430 и старый lobby-layout-browser pass до clean rewrite — историческое
behavioral evidence, не текущая визуальная приёмка. Остатки: все role combinations
и8людей, physicaldevices/keyboard, цепь Back из дочерних editors, итоговый fidelity review.
