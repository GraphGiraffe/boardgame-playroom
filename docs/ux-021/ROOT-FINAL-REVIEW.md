> Исторический отчёт этапа. Актуальные статусы, изменения владельца и границы повторного использования evidence: [CURRENT-IMPLEMENTATION-1111.md](CURRENT-IMPLEMENTATION-1111.md), 11.11, preview.70. Старые PASS/OPEN ниже относятся к указанным в отчёте исходникам.

# Самостоятельный смешанный обход ведущего

02.11.2026. Использованы существующие final-ux-now drivers, без нового harness: изменены только output directory и список наблюдаемых source hashes. Это независимое повторение ведущим, отдельно от отчётов специалистов, по прямому требованию владельца.

Из workspace выполнены:

```
node tmp_files/ux-021/root-final-review/existing-core.cjs
node tmp_files/ux-021/root-final-review/existing-social.cjs
```

Chromium:33core состояния×2ориентации (66кадров) и9social×2 (18кадров). Во всех отчётах failures[], pageerrors[], nativeSupabaseRequests0 и changedDuringRun[]. В core нет horizontaloverflow. Приложение настоящее, данные/ошибки remote контролируются через безопасный account-sync fetch fixture до goto; отправка сообщений/приглашений из visual social trace запрещена fixture.

Порядок: корневые разделы → отмена локального профиля → три вкладки настроек → устройство/облако → установленные/доступные пакеты → theme/deck/arts → уведомления → Auth → актуальная версия → каталог list/2/3/filter → карточка игры/короткие и полные правила → реальное локальное Домино/лобби/меню/StopCancel. Второй trace: вход fixture account → DM/ответ/черновик → профиль → Back → поиск без результатов → Back → группа/info → каталог/последняякарточка.

Непосредственно просмотрены12owncurrentPNG: компактныйportraitкаталог с игроками/тегами, landscape list2/leftlogo+rail, полезныйdefaultDeck с реальными card variants, человеческая packs errorcopy, local lobby, unboxed group conversation844, actualDomino844/его right menu, measuredData390, fullrules/stickyTOC844, settingsBehavior844, searchNoResults390. Новых P0/P1 в этих кадрах не найдено; это не ручной просмотр каждого пикселя всех36тем.

Уточнения после обхода — только две формулировки: Device явно говорит «Локальные партии» при офлайн-обещании; сообщение packs error больше не приписывает HTTP404 плохому соединению пользователя. Поведение/геометрия этим не менялись; исходные PNG этих двух copy-уточнений сохраняются как наблюдение до правки текста. Записи артефактов сохраняют точные исходные тексты своего момента, а будущая сборка — текущие.

Отдельные поведенческие доказательства: full long social по1/1 Chrome/WebKit; UI4affected по4/4; A24 privacy/fairness/epochs по1/1; A22 retained search по1/1 (root прочитал весь owned/active/deferredunavailable код). Дизайнер и UX сделали собственные all36 карты с direct/source/evidence/physical границами. Финальная проверка nested GroupA→notificationGroupB→Back и actual RTCdrawer→Group→Back прошла по1/1 обоими движками у UI; этот visual trace её не подменяет. После freeze RoomChat ведущий отдельно повторил ровно затронутые9social×2ориентации:18кадров, ошибок/nativeSupabase0, changedDuringRun[]. Ранее снятые18кадров сохранены в social-before-room-ownership; нынешние — в social/. Групповой landscape кадр дополнительно просмотрен напрямую. A22/A24 повторены кодером по1/1 обоими; provenance последнего retry-id guard указан в GROUP-CHAT-OWNERSHIP-REVIEW.md.

Физические iPhone/Pixel/Android, OSkeyboard/ShareSheet/HomeScreen/VoiceOver, внешние TURN/Push и production rollout не объявляются проверенными. Все build/deployment состояния отмечаются отдельно. Данные и версии публикаций этим обходом не менялись.

## Completion audit: финальные локальные исправления

Ведущий сверил новый TutorialSettings целиком: captures origin/profile/scope,
после confirm проверяется собственный active frame, offer не принимает Escape
дочернего окна. Existing selected case обоими1/1. SQLgenerator/check прочитан,
existing isolatedPG1/1; exact setup/check hashes совпадают с manifest.

Root самостоятельно перенёс прежний fullscreen case на current Settings/4nav
и удалённый manualscale, добавил active-content assertions и ожидание terminal
transition state. После целевого source change Chrome/WebKit по1/1,4states/engine,
errors/native0; current Chromium Games screenshot просмотрен напрямую.

UI combined handoff→back→nativebot→durablefinished/results→sameLobby проверил
spectator/table Chrome2/2+WK2/2; root просмотрел WebKit table-result первогоpeer.
TicTacToe common pipeline, без заявления samegame-specific proof для15паков.

Кандидат пересобран один раз из-за этих изменений;8SHA и3ZIPCRC прошли.
LOCAL-CANDIDATE.md, source-state.json/verification.txt фиксируют exact dirty
источники и границы. Неизменённые прежние33core/9social проверки не повторялись.
