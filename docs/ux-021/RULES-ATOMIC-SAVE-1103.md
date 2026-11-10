# Одно сохранение правил — одна операция комнаты

Подтверждённый UI RED: единичное нажатие «Сохранить правила» увеличивало lobbyRevision с11до13 вместо12. updateRoomRules вызывал configure порядка, затем updateRules; каждый вызов отдельно менял ревизию, сбрасывал готовность и возвращал копию snapshot. Это не доказательство двух сетевых сообщений: configure не отправляет rules-changed, а оба вызова синхронны.

Теперь приложение вызывает только updateRules. RoomService принимает firstPlayerMode/seatOrder из того же объекта правил, проверяет их до изменения состояния и применяет вместе с правилами. Один сброс готовности, одна ревизия лобби, одна ревизия комнаты и одно событие rules-changed. Вызовы без полей порядка сохраняют существующий порядок. configure использует ту же проверку порядка до изменения любого из двух полей. Контракты ролей/фазы/recovery сохранены; приватные данные и протокол не менялись.

Адресный host-rule unit проверяет один snapshot события, оба порядка, готовность, обе ревизии, запрет гостю, отказ без мутации при invalid mode/order и прежние вызовы без порядка. Вместе с queued-readiness, autostart и lobby-drag boundaries4/4PASS. Existing Unified lobby с UI RED→GREEN:5/5Chromium и5/5WebKit (4viewport+parent); сравнение новой ревизии и отмена draft исполняются на390px. Скриншоты в workspace tmp_files/ux-021/rules-atomic/{chromium,webkit}; sourceSHA и зафиксированные terminal results в report.json. После возобновления /tmp logs/toolchain отсутствовали; это ограничение сохранности логов, не новый отрицательный результат.

Команды из playroom: node --test --test-name-pattern='host rule change clears readiness|queued readiness rejects changed|lobby drag uses existing|autostart defaults on' tests/multiplayer-lobby.test.cjs; node --test --test-name-pattern='^Unified lobby' tests/lobby-layout-browser.test.cjs.

Проверка не закрывает все pack-specific invalid presets, реальные внешние сети, физические телефоны и usability. A08 остаётся частичной по этим границам. Сборка/публикация фиксируются отдельно в LOCAL-CANDIDATE.md после проверки точных байтов.


Сборка завершена:8SHA/3ZIP CRC,230runtime/sourceZIP+manifest совпали. ExactHTML Chromium:12состояний каталога/правил/лобби, errors/native0. Публичные root443/root8443/SW/standalone совпали в4сверках; liveChromium подтвердил activated cache `playroom-pwa-v0.21.0-preview.1-68bb03e1f761ff89`,15игр/PushManager. SHA256 standalone `0e1d657bc46f34391935c44a68944c6e43de7e7180c5ea5c4cae67b990796a96`. PWA227файлов/6073627байт. Результаты предыдущих sourceChrome/WebKit сохранены отдельно от этого artifactChromiumscope.
