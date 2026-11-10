# Чат и приглашения: приёмка A21–A24 — 4 ноября 2026

Статус: четыре выбранные source-цепочки пройдены в Chromium и WebKit. Runtime/паки/превью не изменялись. Это расширение функциональных свидетельств, не объявление полной GOAL0.21 завершённой.

## Выбранные проверки

| Сценарий | Результат и граница |
|---|---|
| `case/lobby-layout-browser --name 'game overlays 0.21: room context, native menu focus and resized RTC chat preserve the scene'` | По1/1 PASS. В каждом report22состояния и43checks: меню/контекст комнаты, focus, native game drag, изменение размера RTC-чата и сохранение сцены. Локальные browser/RTC-порты не заменяют реальные устройства и внешнюю сеть. |
| `case/cloud-account-browser --name 'full conversation 0.21: quiet menu and complete-history search retain drafts and exact bigint jumps'` | По1/1 PASS после уточнения границы закрытых окон: DM/group, полный поиск, точные BigInt-курсор/переход, retained DOM/draft/reading position, входящее окно поверх ожидающего поиска, отказ от позднего перехода/недоступной истории. |
| `case/cloud-account-browser --name 'cloud message UX: DM and group replies, reactions, draft return and cancelled reply'` | По1/1 PASS. Действия DM/group сообщений, reply/reactions, возврат к черновику и отмена ответа через настоящую UI при изолированном provider. |
| `case/cloud-account-browser --name 'invitation badges and cached join actions expire in background without reading chat'` | По1/1 PASS после active-scope уточнения: карточки/фоновое истечение, очередь49чтений без голодания, отсутствие seen ACK от polling, historyAfter/выход из группы/повторный вход offline, поздний metadata/inbox epoch не возвращает старую историю или бейдж. |

Последние три случая используют controlled Auth/RPC/provider. Это не реальные серверные сообщения, приглашения, Push или аккаунты. Находящийся в коде provider lifecycle не переименован в проверку внешней RTC-сети или физической слышимости.

## Диагностика двух первоначальных FAIL

A21 и A23 сразу прошли в обоих движках и не повторялись. A22 первоначально считал все элементы `.conversation-search-modal,.conversation-menu-modal` в документе и ожидал0. Диагностика показала оба оставшихся элемента вне `modal-root`, в выходной визуализации уже закрытых окон. A24 глобальный `[data-group-info=…]` находил два элемента: один active, другой disposed/inert в visual exit. Это не две доступные пользователю команды и не воскресший запрос.

Исправления только в тесте:

- A22 ждёт завершения конкретного поискового service call, затем проверяет0 живых или suspended search/menu в `modal-root` и тот же родительский frame. Дополнительно проверяет именно исходный закрытый frame: он либо отключён от DOM, либо disposed/inert вне `modal-root`. Наличие выходного изображения не используется как доказательство живого окна.
- A24 выполняет group-info/leave/confirm в активной поверхности. После выхода явно проверяет retired исходный membership frame. Пустая история повторного offline-входа проверяется в активном разговоре, а очистка persisted cache, historyAfter, epoch, запрет возврата старой истории/бейджа и все provider guards сохранены.

Удаление нужных анимаций ради глобального count0 не выполнялось. Проверки read acknowledgement, приватности, точных курсоров, retained native nodes и право доступа не ослаблялись. Повторены только эти два упавших случая; оба повторных запуска прошли на каждом движке. Исходные FAIL и surface-diagnostic журналы сохранены отдельно.

## Текущее состояние и evidence

Превью прежнее: HTML `a7eb2bba41840ae83671052f2b20b8afc7db007c70b2ff9e61b953913eac1181`, cache `playroom-pwa-v0.21.0-preview.1-44581c31451e4cc8`. Новой сборки, публикации, SQL, отправки сообщений/Push или изменения служб/соединений не было. Повторный PWA smoke на неизменённых runtime-байтах не запускался. Source drift отслеживаемых runtime/locales/packSources отсутствует; полные исполненные файлы тестов и их новые SHA сохранены отдельно, а не подменяют источник прежней сборки.

[Evidence](../../../tmp_files/ux-021/chat-followup-1104/): final-results.json, source-drift.json, executed-lobby-layout-browser.test.cjs, executed-cloud-account-browser.test.cjs, diagnostic-cloud-account-browser.test.cjs; chromium/webkit1.log и3.log — первые успешные,2.log/4.log — исходные неудачи,2-owned.log/4-owned.log — окончательные успешные. A21report и invitation-report скопированы в engine-specific папки. Диагностика состояния поверхностей — chromium2/4-surface-diagnostic.log. В итоговом JSON original exit отделён от finalExit/finalLog.

Набор даёт адресные свидетельства для A21–A24; он не закрывает все возможные message gestures/native editing, сетевые роли, физические клавиатуры/устройства, AT, серверную доставку/слышимость или самостоятельную usability. Остаточная игровая задержка и переход всех сцен к точечным зависимостям остаются работой0.21.
