# Команда переноса интерфейса 0.21

Уточнено владельцем 01.11.2026. Эти роли действуют при дальнейшем переносе,
а не только при единичном аудите. Решения сверяются с выбранным связным прототипом
и последующими указаниями владельца. Не создавать новые варианты вместо принятого решения.

| Роль | Ответственность |
| --- | --- |
| Дизайнер | Композиция целых экранов, отступы, пустые пространства, плотность, визуальная иерархия, общий внешний вид, единство палитры, иконок, компонентов и поверхностей во всём приложении. |
| UX | Тщательная проверка понятности и удобства для новых и возвращающихся пользователей: ожидаемый результат нажатия, короткие сценарии, терминология, обратная связь, ошибки, доступность и обнаружимость функций. |
| UI / frontend | Правильная работа web-представления, адаптивность, анимации, размеры и ориентации экранов, safe-area, виртуальная клавиатура, мобильные возможности, touch/drag/swipe, фокус и доступность. |
| Код / backend | Корректность application/backend, границы модулей, сопровождаемость, асинхронность, стабильность, сеть и восстановление соединений, authority и границы приватных данных. |
| Ведущий | Продакт/проджект и играющий технический лидер: приоритеты, раздача задач, согласованность с решениями владельца, разрешение противоречий, интеграция, реализация, выбор проверок и актуальный RoadMap. |

## Совместная работа

Участники обмениваются находками и задачами напрямую, используя имена агентов
/root/{design_critic,ux_critic,ui_critic,code_critic}. Передавая проблему, указывать
сценарий, наблюдение, последствия и предложение; отделять наблюдение от гипотезы.
Ведущий получает короткую копию значимых решений и спорных вопросов.

Общие файлы не редактируются одновременно. Ведущий выдаёт каждому узкую область
правок; перед расширением области нужно согласовать её с владельцем файла.
Роли могут быть постоянными, даже если ограничение числа активных агентов требует
работы очередями. Завершивший задачу участник остаётся доступным для следующего ревью.

Цикл: фактический экран/сценарий → перекрёстное ревью → приоритет и критерии →
реализация → выбранная проверка → визуальная/UX-сверка → обновление RoadMap.
Обсуждение и отчёт агента сами по себе не означают готовность продукта.
Не публиковать, не отправлять объявления и не менять облачные настройки без
соответствующего поручения владельца. Не использовать облачные журналы как polling.

## Текущая раздача

Актуальная раздача на 02.11 после общего стека, полноэкранного поиска и проверки обновлений. Исторические передачи ниже сохраняются как журнал; они не являются действующими lease.

- UX (`ux_room_cleanup`): последняя компоновка каталога и навигации — hub-presenter.js только catalogue/nav wrappers, hub-shell-021.css и ровно старые каталоговые правила mobile-surfaces.css; соответствующие существующие rc2-hub-browser cases. Логотип в landscape rail, плотная шапка, count/tags приоритетнее description.
- UI (`ui_platform_audit`): миграция только старого длинного cloud-social case в cloud-account-browser.test.cjs (исходный блок141–302), с сохранением business assertions. Новые A22/A23 runtime и адресные проверки уже прошли; общий каталог согласуется с UX без параллельного редактирования.
- Кодер (`code_critic`): A24 invitation lifecycle в своём существующем browser case и узкий projection-блок cloud-account-rls; реальные адаптеры, private cache/counter/owner/close и zero ACK до чтения. SQL runtime без обнаруженного дефекта не менять.
- Дизайнер (`design_critic`): следующий независимый проход после freeze каталога, A22 и A33. Актуализировать all36 design map и автономный обзор, не выдавая старые кадры за свежую приёмку.
- Ведущий: независимые source/visual reviews, A33/PWA/upgrade ownership, интеграция и актуальные GOAL/матрица/RoadMap. Последняя прочитанная облачная ревизия335, задача work. Все36 и четыре заключительных компетенции ещё не закрыты.

Общий стек app/shared и private controllers интегрирован; отдельные старые frontend
lookup ещё требуют миграции. Обычная короткая панель прикрепляется к низу в обеих
ориентациях; боковая адаптация остаётся правилом игрового чата и игрового меню.
Обновления — полноценный экран. Родитель сохраняется подключённым DOM, а не клоном.

Архитектура и доказательства: SURFACE-STACK.md, PANEL-STACK-IMPLEMENTATION.md.
Следующие точные расхождения: UX-STRUCTURAL-REVIEW-02.md. Общие файлы не изменяются
двумя участниками одновременно; новые lease и их границы сообщаются ведущему.

### Следующая передача после A29

- Ведущий: A29 data1 реализован, финальный cloud-saves-browser по 1/1 Chromium и
  WebKit. Общий toggle вынесен из settings CSS без смены его прежнего вида. Data
  владеет frame и защищает поздние ответы/поколение аккаунта; следующий вход A10
  ждёт конкретного backend preview контракта, а не маскирует join под поиск.
- Кодер: A12 заморожен с evidence; исправлен remove после смены аккаунта (3/3).
  Новый lease — локальный read-only A10 preview в SQL и aggregate allowlists;
  production DDL запрещён в этом этапе. Согласовать контракт до frontend-подключения.
- UI: A30 pack-manager и scoped CSS, настоящие import/update/available/install
  проверки. Исправить плотность карточек и видимость контекста import preview.
- Дизайнер: A29 показанные состояния повторно приняты; независимая сверка A30
  продолжается. Общая приёмка A01–A36 всё ещё открыта.

### После компактной A04 и operation-capability миграции

- Ведущий: A10/Account continuation, A01 common nav geometry/icon anchors,
  root Avatar caller context и responsive grid интегрированы; NAVIGATION и ENTRY
  evidence фиксируют по1/1 Chromium/WebKit,12/10 групп состояний соответственно.
- UX: A20 и повторная компактная A04 заморожены с двумя engine proofs. В A04
  firstlevel остаются только нужные role/status/progress/partial и явный CTA;
  participants/room/date/context доступны в раскрытии. Новые карточки не равны
  прежним200px кадрам; окончательная независимая WK сверка отдельно.
- UI: A11 и A28 заморожены; общий registry включает AvatarPicker. Gallery/skins
  не меняют модели/пакеты/Scene. Responsive avatar correction проверен ведущим.
- Кодер: SaveTransfer и общая capability удаления доведены до durable IDB boundary,
  backward-compatible guard ports; новые actual race cases прошли оба engine.
  Следующий lease — inactive community row bubble/notification routing в
  quick-reactions.js/chat-notifications.js и отдельный community browser case.
- Дизайнер: сверка финальных compact WK, avatar grid и исправленного nav; затем
  следующий самостоятельный аудит оставшихся A01–A36. Bounded принятие новых
  групп экранов не означает полную приёмку всего приложения.


### Текущая передача после A25 и общих вкладок

- Ведущий: финальные A25 и app-tabs по1/1 Chromium/WebKit; новый lease A17 —
  только слой согласия в host-transfer-ui.js и host-offer CSS, без wire/authority.
  Уточнённая цель GOAL.md содержит все36тем и критерии завершения.
- UX: A03/A06/A07 заморожены,52кадра/13состояний, selected дизайнерская сверка19кадров
  принята. Existingbot/lobby/Mage/RC2 cases обновлены; чужие host-transfer/cloud223
  не менялись. Следующие lease выдаются отдельно.
- Кодер: A19 lifecycle доказан обоими движками; duplicate Retry/gap из независимой
  сверки исправляется адресно. Затем A18 community ownership и удаление старого
  icon-only toolbar; app.js/группы/профили вне его lease.
- UI: независимый свежий аудит A13/A15/A21, пока без runtime-правок.
- Дизайнер: финальные A25 ошибки и A03/A06/A07 выбранные кадры приняты; A19 замечание
  передано кодеру. Общая приёмка A01–A36 не завершена.

## Последняя адресная передача после all36 ревью

Root: web.dev audit/установка/контраст/fixedfooters завершены адресно; далее свой независимый mixed walk и точная сборка после sourcefreeze. RoadMap337 прочитан обратно, work.
UI: один длинный legacy-business socialcase без optional capture, final owned DMv2/retained Social/catalogkeys/BFCache. Короткие4affected по4/4 обеимиengine; настоящий long ещё не green.
Кодер: A24 privacy/fairness/epochs завершены, current A22 retained-search busy candidate получил отдельный узкий lease genericSearchUI+existingA22extension; не меняет SQL/RPC.
UX: final all36 direct/source/evidence/physical карта готова; duplicateDM return исправлен ипо1/1 обеими. Последний lease: A28 релевантный initialgallery pack и понятная основная Packs404 errorcopy, безAPI/protocolchanges.
Дизайнер: самостоятельное all36 ревью +126computed contrast samples и addressed geometry приняты в показанномscope. Остаточные P2 переданы исполнителям; его прежние currentPNG не становятся доказательством всех последующих callbacks автоматически.

## Финальный локальный пакет сверки web.dev

Установка из настроек уведомлений на iPhone/iPad открывает общую инструкцию Home Screen поверх исходного окна, без запроса разрешения. Existing PWA-install browser case по1/1 Chromium/WebKit, nativeSupabase0/errors[]; guide390/844 сохраняет свой frame и44px действия.

Nested GroupA→notificationGroupB→Back и actualRTCdrawer→Group→Back прошли обоими движками. RoomChat теперь владеет отдельным cloudGroup controller на retained окно и одним RTCcontroller; provider захватывает identity/revision, drafts/retry ACK имеют владельца. A22/A24 по1/1 обоими; подробные исходные hash и пределы — GROUP-CHAT-OWNERSHIP-REVIEW.md. Ведущий повторил social18 после freeze, source stable, native0/errors[].

Canonical сборка с исходными15паками завершилась exit0; все8записей SHA256SUMS прошли. Локальные артефакты: tmp_files/ux-021/final-build; точный состав и dirty source state — LOCAL-CANDIDATE.md. Версия по-прежнему0.20.1-preview.3, цель0.21; публикация/рассылка/productionSQL не выполнялись. Физическая установка, OSpermission/keyboard/VoiceOver/внешнийTURN/Push и production rollout остаются отдельной приёмкой. Цель/RoadMap не получают ложный общий complete.

## Completion audit после локального кандидата

Закрыты новые конкретные локальные пункты: fullscreen entry из Hub восстановлен
спокойной строкой Доступности; current fallback scroll/lock/content в обеих
ориентациях Chrome/WebKit1/1. TutorialSettings late reset/childEscape actualRED
исправлен own-frame/profile/scope, Chrome/WebKit1/1. Full SQLsetup включает
host-transferPush,18function+trigger19checks; isolatedPG1/1 сnegativeguards.

Единая цепь playinghandoff→обратно→nativebot→durablefinished→automaticresults→
sameLobby безcountdown0 теперьChrome2/2+WebKit2/2 (spectator/table,TicTacToe).
Кандидат пересобран,8SHA+3ZIPCRCpass. Исторические артефакты сохранены отдельно.
COMPLETION-AUDIT.md и OWNER-ACCEPTANCE.md отделяют оставшиеся пользовательские,
физические и production gates от уже доказанной локальной реализации. Общая
цель active, публикации и рабочей базы не касались.
