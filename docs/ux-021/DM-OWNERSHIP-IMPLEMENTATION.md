# Retained DM: отдельный controller для каждого разговора

2 ноября. Старый long cloud-social case выявил реальный разрыв: Alice DM →
уведомление от Mikhail → Back уничтожал Alice DM и его черновик. Это не замена
бизнес-проверки новым селектором.

## Причина и контракт

Прежний `ChatUI.show` вызывал общий `close()`, меняя единую generation и делая
retained parent frame невалидным. Кроме того, общий `openModal` заменяет активное
окно того же класса по умолчанию. Поэтому новая DM factory использует явный
`mode:'push'`, а не snapshots/повторное создание старого DOM.

- Каждый `createView()` владеет своим frame, person, messages/features/cursor,
  generation, loading/send/read flags, timer и AbortController обработчиков.
- DOM lookup строго через свой frame; activeHost fallback удалён. Document
  handlers действуют только в активном собственном разговоре. Retained parent
  не отправляет скрытый seen ACK или позднее UI-действие.
- Общая account-prefixed карта draft сохраняется между закрытием и новым открытием.
  Внутренний Symbol owner не позволяет позднему ACK/утилизации suspended view
  перезаписать более новый черновик того же адресата в другом view.
- Внутренний `close` идемпотентно retires только свой view, очищает timer и aborts
  listeners. Публичный `close()` retires все DM; внешний существующий caller —
  Community account-replacement lifecycle, который затем invalidates общий registry.
- `currentUserId()` и `captureReturn()` выбирают только действительно активный,
  account-valid controller. Back и parent disposal остаются общим surface registry.
- A22 search ports/BigInt canonical jump и A23 native composer/reply/reactions
  остаются внутри своего controller. Бэкенд и ChatState API не менялись.

## Сохранённое восстановление страницы

При `pagehide.persisted` view сохраняет draft/scroll и останавливает timer,
сохраняя DOM и обработчики. `pageshow.persisted` возобновляет тот же frame только
при действующем account owner; читается только реально активный разговор.
Обычный nonpersisted pagehide по-прежнему закрывает controller.

Longcase проверяет две управляемые `PageTransitionEvent` с persisted, равенство
реальных conversation/editor nodes, сохранённый черновик и настоящую отправку
после восстановления. Это controlled lifecycle-port проверка, а не сертификация
физического BFCache на всех браузерах/телефонах.

## Проверки

Проверяются исходный long social business flow и affected existing A22 full search,
A23 reply/reactions, Community account/retired-action ownership и hidden-anchor
banner/no-read policy в Chromium и WebKit. A24 privacy/group rejoin integration
принадлежит отдельному кодеру и повторяется им на точном frozen DM source.
Финальные логи и source manifest указываются в LONG-SOCIAL-MIGRATION.md после
прохождения; промежуточный v1 не подменяет окончательный v2.

Финальная интеграция: полный longcase **Chrome1/1 + WebKit1/1** прошёл с native
Alice→Mikhail→Back, сохранением точно тех же DM/editor nodes и controlled
persisted hide/show→send. Четыре смежных existing cases — по4/4 обоими движками;
A24privacy и P2 same-DM profile return отдельно проверены их владельцами.
Полные current-source hashes и TAP logs: `tmp_files/ux-021/long-social/final-report.json`.
