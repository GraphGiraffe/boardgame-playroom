# Рабочий сервер: четыре согласованных обновления

Пользователь явно разрешил четыре SQL-обновления после просмотра конкретного плана. Они выполнены в единственном PlayRoom-проекте `https://geurlwivdiqboylciqhl.supabase.co`, совпавшем с app/network-config.js. Клиентский candidate7aa60d95…d0333d503/cache6c3fc9fff2fa5ba1 не менялся; новая сборка/PWA-публикация ради серверных и документальных изменений не требовалась.

## Исполнение и проверки

Перед записью повторно проверены project URL, неизменность whitelist body hashes/owner/ACL/schema и operational booleans. Все четыре review-copy SHA совпали с canonical source и source ZIP текущего кандидата; исходные BEGIN/COMMIT сохранены. Использован scoped Supabase apply_migration, последовательно, без полного setup и без повторов операций.

| Шаг | Применённый SQL | Installed / exact после шага |
|---|---|---|
|1|account-sync.sql|16/12|
|2|chat-actions.sql|16/14|
|3|push-read-receipts.sql|16/16|
|4|host-transfer-push.sql|19/19|

Получены четыре success receipts, а окончательный generated checker вернул ровно19уникальных строк: все installed/exact_match=true. Все10изменённых routine bodies совпали с packaged source. Семь internal helpers закрыты для anon/authenticated; три публичных API сохраняют authenticated execute и запрещают anon. Права остальных существующих API не переписывались этими файлами.

У четырёх новых таблиц включён RLS, effective ANY privileges для anon/authenticated=false. Обе reply_to columns bigint/nullable, self-FK ON DELETE SET NULL. Проверены ICU und deterministic collation, room-read expiry index и точный host-transition trigger. Независимый backend review пересчитал source SHA и все эти утверждения по сохранённым данным: [POST-REVIEW](../../../tmp_files/ux-021/live-capability-audit-1103/operator/POST-REVIEW.md).

Сохранены operational booleans: Push enabled=true, public key presence, wake trigger/function, Vault presence и один active canonical cron retry. Значения ключей/секретов не читались; cryptographic equality ключей не заявляется. Исходные SQL не записывают Push/Vault/Edge/cron/diagnostics configuration. Edge deployment hashes/versions/status совпали до и после: Push ACTIVEv7, ICE ACTIVEv1; Edge redeploy не делался. Proxy/VPN/Tailscale не менялись.

## Что теперь поддерживает сервер

Установлены ответы/реакции сообщений, Unicode search и room preview в текущем RPC-контракте; room-read receipts и relevance suppression; уведомления о будущих offer/decision/completion передачах хоста. Старые host-transfer rows не воспроизводятся. Служба Push была enabled до обновления и осталась enabled; дальнейшие разрешённые действия пользователей могут создавать новые уведомления.

Существующие сообщения, сохранения, участники и подписки не подвергались тестовым DML; пользовательские строки, очередь и payload не читались. Root не выполнял provider smoke sends, claim/complete/wake, важные announcements, тестовую регистрацию или signed-in пользовательские сценарии. Наличие сервера/worker и19fingerprints не подтверждает доставку/показ Push на телефоне или реальный RTC/TURN.

После обычного перезапуска актуальной PWA клиент заново получает серверные capabilities. Старый cached session может требовать повторного открытия; очищать сохранения/данные не нужно. Подробный физический и двухсторонний маршрут остаётся в [OWNER-ACCEPTANCE.md](OWNER-ACCEPTANCE.md).

## Advisors и границы

Полученный security-advisor snapshot содержит0ERROR,26INFO и12WARN findings; он не считается новым полным security PASS. Прямые schema/ACL checks выше относятся к текущему postflight, тогда как generation/freshness advisor snapshot после последнего DDL не доказана. Поля time в step-json — время записи receipt на стороне агента, не точные времена COMMIT.

Четыре новых INFO no-policy tables намеренно RPC-only: RLS и запрет effective direct privileges проверены.1anon+8authenticated SECURITY DEFINER findings относятся к намеренным API entrypoints, разобранным по source в POST-REVIEW; изменение их grants только ради lint нарушило бы API. Отдельно остаются notice об отключённой leaked-password protection и два notice о cron policies. Последние не доказывают effective anonymous access без отдельной проверки ACL/API exposure. Эти вопросы не исправлялись автоматически и не маскируются общим PASS; Auth и cron configuration не входили в разрешённые четыре изменения.

## Авторизация и сохранённые доказательства

[План](../../../tmp_files/ux-021/live-capability-audit-1103/operator/PLAN.md), approval-granted.json, execution-preflight.json, step-01..04.json, execution-postflight.json, security-advisors.json и POST-REVIEW.md находятся в `tmp_files/ux-021/live-capability-audit-1103/operator/`. Все source hashes четырёх артефактов и backup provenance указаны в плане. Source/runtime остаются прежними; эти checks не запускаются повторно ради документации.

Automatic approval review отклонил первоначальное чтение pg_get_functiondef как потенциальный вывод чувствительного server-side code. Запрос не выполнялся и не повторялся. Безопасная альтернатива успешно завершена: пять прежних production body hashes совпали с уже локальным Git c0722bc6655abf51c40419396c7367cd5d19da1f, а owner/ACL/settings сохранены как metadata; резервные локальные определения owner-only0600. Production bodies и secret values не выгружались. Сама запись четырёх миграций отдельно одобрена пользователем и выполнена в указанном scope.

Общий GOAL0.21 остаётся active/work: физические устройства, реальные signed-in цепочки/сети, доставка и suppression Push, AT и самостоятельная понятность новым пользователям не закрываются этим metadata/schema rollout.
