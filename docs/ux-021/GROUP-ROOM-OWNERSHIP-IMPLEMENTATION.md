# A21/A22: независимые retained-группы и игровой чат

## Доказанная ошибка и граница исправления

Existing group-members browser case воспроизвёл Group A → настоящее уведомление
Group B → Back. Старый RoomChatUI singleton удалял Group A: исходный conversation
node и editor становились disconnected, черновик исчезал. Исходный RED сохранён
в `tmp_files/ux-021/long-social/group-return-proof-chromium.log`.

RoomChatUI теперь создаёт отдельный owned controller для каждого облачного
разговора и один controller для текущего RTC-чата. Общими остаются ChatState и
account-scoped draft/reply/retry stores. Протоколы, сервер и игровой authority
не меняются.

## Контракт владения

- У view свои frame/panel, context provider, строки/канал, flags, timer,
  generation и AbortController. Listeners работают только внутри действительно
  активного собственного DOM. Полноэкранные разговоры используют общий registry
  в режиме push; собственный Back/dispose retires только свой controller.
- Provider облачной группы захватывает immutable groupId, service object,
  account key и service generation. Проверка действует перед каждым RPC и после
  ожидания; старый view не начинает запрос от заменившего его аккаунта.
- Ключи draft/reply/retry привязаны к захваченному account key. Per-view Symbol
  не позволяет позднему ACK старого экземпляра стереть новый черновик той же
  группы. Retry удаляется только при совпадении точного nonce.
- `receive` и `presented` относятся только к единственному RTC controller.
  Cache merge, incoming activity и bubble policy вызываются однократно;
  облачная группа не присваивает себе игровой канал и не закрывает dock.
- `currentGroupId()` и `captureReturn()` выбирают действительно активный и
  account-valid view. `close({groupId})` retires нужную группу при выходе;
  `reset()` retires все views и очищает stores при account replacement/logout.
- `pagehide.persisted` сохраняет собственный draft/scroll и приостанавливает
  timer без отключения обработчиков; `pageshow.persisted` возобновляет только
  действующего владельца. Nonpersisted pagehide retires view.
- Search ports, canonical BigInt jump, historyAfter purge, privacy/read guards,
  A23 reply/reactions и nonmodal RTC dock остаются внутри своего controller.

## Внешние вызовы

Community account lifecycle вызывает `reset()`. GroupUI leave использует
targeted close. Notifications/Push/LobbyNetwork получают owned captureReturn.
GameChatPanel сохраняет свою nonmodal модель; QuickReactions проверяет только
RTC `presented`, а native network delivery вызывает общий `receive`.

## Адресная приёмка

Existing group-members case проверяет actual notification navigation A→B→Back,
exact native DOM/editor/draft, controlled persisted hide/show и работающий
quiet Refresh после восстановления. Chrome и WebKit: по 1/1 PASS, native
Supabase requests 0, page errors []. Это controlled lifecycle-port проверка,
а не сертификация физического BFCache.

Existing actual-RTC game-overlays case дополнен dock→notification cloud group→Back:
real paired Ludo peers, тот же native dock/editor/draft/room/participant,
selection и новое сообщение реального напарника после возврата. Облачная часть
использует явно контролируемый account/provider port, а не настоящий Supabase
Auth; игровой RTC канал и его delivery настоящие. Pointer click уведомления
может изменить focus до открытия дочернего окна; возврат не навязывает фокус,
которого уже не было в момент modal snapshot.

Финальный actual-RTC/A32/Group-return: Chromium 1/1 PASS (26.6 s), WebKit 1/1
PASS (51.1 s), каждый по 18 states/18 checks, errors [], native Supabase 0.
Group A/B с controlled persisted restore: по 1/1 PASS обоими движками.
После этого runtime frozen; дополнительная однотипная проверка остальных
экранов в эту приёмку не включена.

Финальные hashes и результаты RTC хранятся в отдельном
`tmp_files/ux-021/long-social/group-room-final-report.json`. A22 search и A24
privacy/rejoin повторяет независимый code reviewer на frozen source;
общий long social и весь suite без нового основания не повторяются.
