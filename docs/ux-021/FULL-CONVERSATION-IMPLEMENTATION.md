# A22: новая композиция полного разговора и поиск

Источник решения: `reference-conversation-390.png` / `reference-conversation-844.png`
в `tmp_files/ux-021/fidelity`, выбранный экран разговора и поздние указания владельца.
Это ограниченная реализация A22/A23, не приёмка всех A01–A36 и не публикация.

## Композиция и ответственность

Полный личный/облачный групповой разговор теперь имеет Back, кликабельную
личность/группу, тихое меню `⋯`, историю непосредственно на фоне экрана и
закреплённый capsule composer. У истории нет старой общей зелёной рамки.
Ручное обновление осталось строкой меню, загрузка ранних сообщений — текстовым
действием внутри истории, ошибка/Повторить — рядом с относящимся к ней содержимым.
Общий composer, ответы, старые реакции и закрепление кнопок сохранены.

`conversation-search-ui.js` владеет только общими меню/поиском/переходом;
`chat-ui.js` и полный режим `room-chat-ui.js` дают порты точного разговора.
Сервисы, игровые wire/authority и ChatState API не менялись этим frontend-переносом.
Точный контракт сервера, права и отдельный source rollout описаны в
[CONVERSATION-SEARCH-BACKEND.md](CONVERSATION-SEARCH-BACKEND.md).

Полный RTC-чат получает ту же спокойную композицию и реальное обновление.
Поиска по неполной локальной истории в нём нет: A22 search относится к личным
и облачным групповым разговорам; новый RTC-протокол поиска не выдумывался.
Игровой nonmodal drawer A21 остаётся отдельной композицией.

## Поиск и возвращение

- Возможности меню определены до показа: `features.search === true`. На старом
  сервере поиск явно недоступен; обновление переписки доступно отдельно.
- Поиск запускается явной отправкой, 2–200 символов, literal case-insensitive
  по всей доступной серверной истории. Результаты newest first, страницы по 40;
  отображается число показанных, без выдуманного общего количества.
- Текст результатов экранируется; excerpt окружает совпадение. Результаты
  эфемерны, не попадают в ChatState и не подтверждают прочтение.
- Search/Menu — дочерние поверхности общего registry. Back возвращает точный
  conversation DOM, черновик и прежнюю позицию чтения. Отменённый/поздний запрос
  не может восстановить закрытую поверхность. Guard проверяется до RPC и после await.
- Явный переход сначала читает canonical target context через
  `(BigInt(hit.id)-1n).toString()`, затем проверяет точный ID. Только после этого
  возвращает исходный экран, обновляет историю и прокручивает к цели.
  Отсутствующий target удаляется из результатов; предлагается повторить поиск.
- Изменившийся `historyAfter` применяется одним canonical helper как в обычном
  read, так и при переходе. Сначала удаляются запрещённые cached rows и скрытый
  родительский DOM, затем урезаются уже показанные hits. Даже недоступный target
  не оставляет старые snippets ниже нового boundary.
- Серверный forbidden/not-found очищает результаты и утилизирует принадлежащее
  группе дерево поверхностей. Полный `groups-updated` без текущей группы делает
  то же самое. Смена аккаунта использует существующий generation fence и общий
  lifecycle; никакого reset чужой foreground-поверхности нет.

## Адресная проверка

Существующий meaningful A23:

```
node scripts/codex/test.cjs case/cloud-account-browser --name 'cloud message UX:'
```

Новый bounded случай в том же файле:

```
node scripts/codex/test.cjs case/cloud-account-browser --name 'full conversation 0.21:'
```

WebKit использует тот же тест через существующий `PLAYWRIGHT_MODULE` adapter,
`PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit` и локальные runtime libraries.
Safe provider установлен до навигации; native Supabase requests обязаны быть 0.
Service Worker не блокируется. Это не проверка server rollout или доставки Push.

Сценарий моделирует полную историю из 122 сообщений, начальную страницу 80,
41 literal matches в двух страницах, русский регистр и `%_`, отсутствие search ACK
и cache merge, сохранение draft/scroll, late response после Back, min/max, quota
ошибку с повтором, исчезнувший target и новый поиск. Cloud group ID/seq остаются
строками `9007199254740993/4`: переход к первой не подтверждает вторую, пока она
не видна. Дополнительная проверка меняет history boundary между search и jump,
затем отзывает членство и удаляет группу через настоящий lifecycle update во
время pending search. Бэкенд-права отдельно доказаны isolated PostgreSQL case.

`installFetch` не создаёт нативные HTTP response events: ожидание позднего ответа
использует completion gate самого fixture. Виртуальный aggregate wrapper переводит
typed HTTP errors в section errors; ему не передаются raw successful data.error
как будто это уже обработанный SQL aggregate result.

Кадры сохраняются после завершения finite enter animations, без тестовых overlays:
`tmp_files/ux-021/conversation-search/{chromium,webkit}/` — `full-dm`, `full-group`,
`menu-*`, `search-*`, `search-error-*`, `jump-*`, `group-history-boundary`.
Результаты окончательного прогона и точные source hashes фиксируются рядом.
Реальные телефоны, OS keyboard/safe-area, все темы и весь набор социальных
взаимодействий не объявляются проверенными этим ограниченным случаем.

## Финальное локальное evidence

2 ноября: расширенный A22 case **Chromium PASS 1/1, WebKit PASS 1/1**;
по 40 перехваченных provider calls, `nativeSupabaseRequests: 0`, `page errors: []`.
Meaningful A23 на этой же версии conversation runtime отдельно прошёл
**Chromium 1/1 и WebKit 1/1**, по 42 provider calls; последующие правки затрагивали
только дополнительные A22 fixture checkpoints. A23 TAP-лог предыдущего совместного
прогона отдельно не сохранялся; не подменяем его новым A22-only логом.

Финальные A22 TAP-логи: `conversation-search/frontend-{chromium,webkit}.log`;
source hashes, перечень фактических PNG и границы доказательства —
`conversation-search/frontend-report.json`. Все пути здесь относительно
`tmp_files/ux-021`. Это свежая локальная проверка, серверный search source ещё
требует отдельного owner rollout; в production не отправлялись сообщения/Push.

## Независимая проверка root

02.11: прочитаны весь ConversationSearchUI и порты DM/group. Проверены ownership/request guards до RPC и после await, недоступность detached handlers, буквальный escaped excerpt, decimal IDs/BigInt при target jump, проверка наличия цели до возврата, граница historyAfter и сохранение разговора. Нового блокера в этой ограниченной source-проверке не найдено; это не заменяет финальный пользовательский обход или production SQL rollout.

## Последующая проверка вложенных разговоров

Расширенный long social выявил отдельную ошибку single-global DM controller.
Рефакторинг и его API/lifecycle границы описаны в
[DM-OWNERSHIP-IMPLEMENTATION.md](DM-OWNERSHIP-IMPLEMENTATION.md). Новые controller
frames сохраняют выбранную A22 композицию, но исходный A22 source manifest не
выдаётся за хэш этой последующей версии. Дополнительные current проверки ведутся
в long-social evidence.
