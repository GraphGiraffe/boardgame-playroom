# GOAL9: передача хоста → настоящий итог → лобби

Existing `host-transfer-browser` case `live game transfer to … allows play while
waiting for consent` расширен для обеих существующих ролей: spectator и table.
Финальная проверка: **Chromium 2/2 PASS, WebKit 2/2 PASS**, page errors [], native
Supabase requests 0. Изменён только этот блок теста; runtime не менялся.

Proof-game — **Крестики-нолики**, seed 16, pack 0.3.6-preview.1. Два настоящих
локальных RTC peer проходят одну связную последовательность:

1. Зритель либо «Стол» входит в комнату с человеком и ботом.
2. Предложение передачи во время партии остаётся пассивным; исходный хост
   продолжает настоящий ход, получатель не получает принудительную панель.
3. Явное принятие передаёт host authority без изменения неигровой роли:
   viewer -1, hostMode table. Затем хост передаётся обратно исходному игроку.
4. Продолжение через настоящие игровые кнопки приводит к штатному scheduled bot
   action: actor 1 выигрывает на ходе 6. Durable journal уже содержит finished
   record и revision 6 до проверки видимого результата.
5. Оба peer автоматически получают result surface. Оба нажимают «В комнату»
   и видят ту же room ID в phase lobby; countdownEndsAt null, countdown DOM нет.

Подготовка детерминирована: Session сначала вычисляет законный сценарий до
победы бота, затем настоящий HostSessionService создаёт durable запись с move 0.
Только до mount два законных префиксных действия проводятся через native
authority player dispatch / actBotAsync с каноническими commit/receipt/journal;
промежуточные preparation timers отменяются. После mount используются обычные
UI, scheduler, persistence, handoff и RTC, без подмены позиции или complete().
Raw состояния не редактируются, result markup не подставляется.

Первоначальная длинная Ludo-подготовка не используется: store корректно отвергает
создание новой сетевой записи с ненулевого хода, а сотни durable префиксных
коммитов не подходят существующему короткому UI wait. Ограничения хранилища и
таймауты не ослаблены: case deadline 100000 ms, default UI wait 12000 ms.

Команды (выбраны только два параметризованных случая существующего companion):

```sh
node scripts/codex/test.cjs case/host-transfer-browser --list
node scripts/codex/test.cjs case/host-transfer-browser --name 'live game transfer to '
LAB_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/host-transfer-browser --name 'live game transfer to '
```

Артефакты: `tmp_files/ux-021/handoff-completion/final-report.json`, четыре owned
engine/role reports, result screenshots обоих peer; логи
`tmp_files/ux-021/handoff-completion-final-{chromium,webkit}.log`.
Это common-pipeline proof на TicTacToe, а не утверждение о post-handoff
завершении Domino или Ludo. Отдельная предыдущая Ludo team-result приёмка
остаётся в LIVE-COMPLETION-ACCEPTANCE.md. Physical devices, внешние TURN/Push,
Supabase Auth и production здесь не проверялись.
