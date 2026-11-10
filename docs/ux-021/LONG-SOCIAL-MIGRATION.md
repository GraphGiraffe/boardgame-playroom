# Старый long cloud-social case: перенос на принятый 0.21 UI

2 ноября. Область изменения — только тест
`cloud social: fixed account prefix, scoped community entry and Online room settings`
в существующем `tests/cloud-account-browser.test.cjs`. Отдельные A22/A23 и A24
cases не переписывались; runtime исправления требуют самостоятельного факта
воспроизведения и отдельного согласования.

## Исходные гипотезы и перенос

| Старое ожидание | Принятый текущий контракт |
| --- | --- |
| Add/Refresh/Edit в иконках шапки | Primary «Добавить друга» и quiet «Управление списком» |
| Refresh в шапке полного чата | `⋯` → «Обновить переписку» |
| Общая рамка `.social-list` вокруг history | История прямо на поверхности, оформлены сообщения |
| Группы рядом с друзьями во вкладке Friends | Группы в Chats; Friends не запрашивает group-list |
| Отдельные старые кнопки приглашения участника | Native selection form и явная отправка выбранного |
| Профильные icon strips и жёсткая геометрия пары | Подписанные action rows с touch targets и корректными правами |
| Edge-clamped bubble у невидимого аватара | Невидимый anchor не говорит; настоящий inbox даёт banner fallback |
| Минимальный viewport 320 px | 360 px: слишком малые экраны исключены владельцем |

Новые локальные helpers выполняют реальные клики: maintenance summary, refresh/edit
и меню разговора. Они не вызывают внутренние GroupUI методы вместо навигации.
Намеренные fixture вызовы сервисов/уведомлений/обновлений уже существующего
сценария сохраняются как контролируемые server/lifecycle stimuli.

## Сохраняемые бизнес-проверки

- Необязательный cloud на старте, отдельные аккаунты, фиксированный префикс `@`.
- Запрос/принятие/отмена удаления друга; профиль и черновик возврата.
- Native multiline composer, shrink, HTML escaping, девять прежних реакций,
  long press explanation, выбор/отправка и черновик.
- Режим комнаты и автостарт; доступ/пароль/смена/отключение/повторное включение;
  share links и очистка секретной части URL после входа.
- Отмена выбора перед Send ничего не отправляет; повторное приглашение,
  личные/групповые приглашения и их declined/joined/expired presentation.
- Группы: создание, выбор участника, приглашение, подтверждение, сообщения,
  live membership refresh без remount, history toggle, отмена/подтверждение выхода.
- Отдельные настройки партии через действующее игровое меню.
- Баннер поверх редактируемого профиля без потери формы, dismiss/expiry без read ACK,
  тишина для открытого соответствующего чата, новый неизвестный собеседник.
- Ручной порядок стрелками и drag, сохранение порядка, scroll/read cursors,
  cache/delta при повторном открытии, unread/counter caps.
- Ошибки group-list сохраняют другую информацию; SQL raw text остаётся скрытым.
- Обе safe provider границы и ноль native Supabase requests; ошибки страницы запрещены.

## Проверка и границы

Точный выбранный запуск:

```
node scripts/codex/test.cjs case/cloud-account-browser --name 'cloud social: fixed account prefix'
```

WebKit — тот же case через существующий browser adapter. Service Worker не блокируется.
Логи/кадры сохраняются в `tmp_files/ux-021/long-social`; итоговые результаты
записываются только после успешных адресных запусков. Сам по себе перенос
селекторов не считается green и не закрывает A01–A36, production или физические телефоны.

## Обнаруженная реальная ошибка каталога

Контрольный longcase выявил пропажу всех карточек при Nearby lobby → закрыть →
Games → снова выбрать игру. Важное уточнение: первый клик карточки проходил;
таймаут был на втором клике после `leaveLobby`, а не на первоначальной прокрутке.
При этом E.GAMES/catalog содержали 15 игр, hidden/favorites пусты, page errors — [];
входящий Hub markup тоже содержал 15 карточек. Диагностический wrapper показал
`GameScreen.update` на выходе из лобби: before15/incoming15/after0, removal из общего
keyed patcher. Temporary `preserveLayout:false` сохранял 15 и позволил исследовать
следующий участок. Эти диагностические запуски не являются PASS.

Общий patcher не изменялся. Самый узкий исправленный контракт — устойчивые
`data-entity` у sibling границ каталога: intro, toolbar, favorites, recent, other,
filtered, edit-group и resume. Раздел больше не сопоставляется с чужим unkeyed
`section` при изменении соседей. `resumeCard` принимает необязательный attrs и
передаёт его уже существующему `sessionCard.attrs`; компоновка не менялась.
Исходный путь проходит с `preserveLayout:true`, без reload/override.

Root Social получил всегда смонтированный opaque placeholder внутри своего
неактивного inert/aria-hidden panel. Это сохраняет настоящий input, значение и
выделение при root-переходах. Внутренний `CommunityUI.show` выбирает root fallback
только у активного Socialpanel; скрытый placeholder не становится невидимой
foreground-поверхностью. При уходе с Social новый узкий lifecycle retire только
view-owned pending capabilities/tickets/busy, сохраняя DOM и legitimate prior error.
Пассивный cache refresh не выдаёт seen ACK и не рисует ошибку завершившейся операции
в другом root context. Точный existing ownership case проверяет эти свойства,
смену аккаунта и устаревшие ответы. Общий active(view) контракт не менялся.

Все temporary diagnostic reload/full-patch flags, wrappers и native method hooks
удалены из итогового case. В failure output остаются только ограниченные model/DOM
counts/preferences для диагностики повторной регрессии.

## Перенос входа по ссылке

A12 теперь показывает разрешённый server preview и явный «Войти в комнату».
Longcase использует настоящий preview/Enter и provider `room-preview`, сохраняя
проверки password on/off, значения пароля из ссылки, connect port и очистки URL.
Прежнее ожидание автоматического connect до явного Enter было устаревшим UI flow.

## Финальный результат

Исходный полный longcase прошёл **Chromium 1/1 и WebKit 1/1**, skip0,
`nativeSupabaseRequests:0`, `page errors:[]`. Прежний timeout210s сохранён.
В финальном запуске отключён только опциональный массовый capture; ни одна
бизнес-ветка не пропускается и forceclick не используется. Вспомогательные страницы
share-link и локальных настроек закрываются сразу после своих проверок, main pages
возвращаются на передний план. Это правильная изоляция actor UI, а не изменение
приложения ради теста и не заявленный performance benchmark.

Offscreen проверка прокручивает последний элемент именно представленного списка,
а не первый retained hidden root через глобальный querySelector. Проверяется
конкретное новое сообщение: anchored presenter отказывается от доставки,
появляется его banner, не создаётся его edge-clamped bubble. Другие сообщения не
объявляются запрещёнными только из-за одновременного существования другого bubble.

SQL raw text по-прежнему не показывается. Новый product UI использует понятное
сообщение/Retry; сохранение технического кода42702 проверяется на typed RPC error
boundary, а не навязывается интерфейсу. `group-list` counter проверяется у
соответствующего actor, исключая законные фоновые чтения другого клиента.

Смежные existing A22/A23 и Community ownership/hidden-anchor cases на DMv2 прошли
**4/4 в каждом движке**. Последующая отдельная правка retained Search lifecycle
принадлежит кодеру и проверяется им; longcase подтверждает только совместимость
quiet Refresh menu. P2 profile→тот же DM проверен UX-критиком отдельно в обоих
движках, A24 privacy/rejoin — кодером. Доказательство локальной группы и ссылки
не подменяет реальную Supabase/TURN/Push приёмку.

Финальные логи: `tmp_files/ux-021/long-social/{chromium,webkit}-final.log` и
`affected-{chromium,webkit}.log`. Точные текущие hashes owned runtime modules,
хэш только нашего test block (другие агенты меняют свои блоки того же файла),
длительности/счётчики и ограничения — `final-report.json` рядом. Промежуточные
`diagnostic-*`/`failure-*` не выдаются за финальные кадры.
