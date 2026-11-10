# Превью A13: доступ в комнату и крупный текст — 3 ноября 2026

В настройках «Рядом» хост может менять «Игроки могут приглашать» перед формой названия. Изменение сообщает подписчикам комнаты через существующий event path. Повтор того же значения не создаёт событие, отзыв разрешения немедленно отменяет ожидающие делегированные приглашения. Online сохраняет прежний RPC; автостарт остаётся в лобби. Подписи гостя, хоста в партии и восстановленной комнаты описывают доступные действия.

Сохранены DOM/черновик/выделение/прокрутка названия. Старые и чужие панели, поддельные/отсоединённые контролы и смена владельца/фазы/режима не могут изменить другую комнату. Отказ на ещё активной панели показан inline и отключает переключатель. Синхронные callbacks читают свежий snapshot, не откатывают nested изменение и не возвращают пользователя из B в A. Nearby владелец захватывается до await создания предложения.

Общий переключатель теперь использует .9375rem вместо15px: автостарт, доступ/пароль Online и новый A13 масштабируются одинаково. Сохранить/Отмена переносятся целыми кнопками при нехватке ширины; обычные размеры сохранены. Первоначальное обрезание Отмены на ×2 выявлено визуально и зафиксировано RED, затем закрыто локальными bounds/word gates.

## Проверено

- Существующий permission unit: RED0notifications → PASS1/1; subscriber/revision/event/no-op/revoke/nested update. [Backend proof](../../../tmp_files/ux-021/a13-followup-1103/backend-fix/report.md).
- Четыре адресных существующих case × Chrome/WebKit: панель A13, name draft, Nearby host, Online invite/access —8PASS. Крупный текст проверен controlled root16→32; целые слова, границы каждой кнопки и44px. [Frontend proof](../../../tmp_files/ux-021/a13-followup-1103/frontend-fix.md).
- [Независимая визуальная ревизия](../../../tmp_files/ux-021/a13-followup-1103/design-final-review.md): финальные4PNG, permission→name→Save/Close, truthfulcopy, normal16 без изменения размеров; старые обрезанные кадры не приняты финалом.
- Точный собранный standalone:28состояний Chrome +28WebKit с обычной анимацией, errors/native/sourceDrift0. Реальный выбор Network, enable/revoke в панели и сохранённый несохранённый name draft проверены непосредственно в assembled HTML.
- Build exit0;8SHA/3ZIP CRC;230runtime+2canonical locales совпали с sourceZIP; worker source/protocol неизменны. Изменены6runtimeфайлов, паки/игровые правила/ассеты не менялись. PWA227файлов,6 102 582байта (+3 847).

## Опубликовано

Полная временная PWA15игр: [443](https://seth.tail6aebd4.ts.net/), [8443](https://seth.tail6aebd4.ts.net:8443/), [standalone](https://seth.tail6aebd4.ts.net/hod-021.html). Build `tmp_files/ux-021/a13-final-1103/final`, SHA256 `457b7d029ac34373320a3e7ba72a42330db0237ccde172d80d55392ea5d1baeb`, cache `playroom-pwa-v0.21.0-preview.1-b9b766a2d4e2976d`. Public4bytechecks PASS; живой Chromium worker activated/cache/buildIdentity/15games совпали. [Manifest](../../../tmp_files/ux-021/a13-final-1103/final-manifest.json).

## Не выдаётся за PASS

Один дополнительный Chrome UNO same-origin RTC case остановился до проверки permission/delegation на старом неограниченном `.modal` selector; подготовленные минимальные миграции теста сохранены в worktree. [Отчёт с RED и границами](../../../tmp_files/ux-021/a13-followup-1103/rtc-permission/report.md). Это не подтверждает ни новую неисправность продукта, ни успешную сквозную передачу разрешений. Runtime/sourceunit и mocked peer/RPC проверки имеют отдельный scope. Последние test-only миграции этого RTC-case сделаны после сборки; совпадение sourceZIP заявлено для230runtime+2locales, не для всех текущих тестовых файлов.

Физические телефоны/OS text/IME/AT, реальные аккаунты/Push/сети/TURN, все игровые жесты/эффекты/обучения, измеренная производительность и самостоятельная human usability остаются открытыми. Общий GOAL не закрыт. SQL19/19 ранее применены отдельно; этой итерацией БД/Edge/cron/config/реальные Push/объявления не менялись. Стабильные Pages/R2/Cloudflare не публиковались.

RoadMap `ux-021-full-audit`: revision369/work, описание дополнено с сохранением истории, readback подтверждён.

## Subsequent local RTC acceptance

The earlier legacy-selector RED is superseded for the single UNO local scenario: [current RTC report](../../../tmp_files/ux-021/current-game-checks-1103/rtc/REPORT.md), Chromium1/1 +WebKit1/1 PASS. Actual local third-client delegation/permission revoke/preservation, Table/seat, ready/start, pause/resume, move/privacy verified on the same457b runtime+3c7995fa companion. Real phones/networks/TURN/all-game chains remain unproved.
