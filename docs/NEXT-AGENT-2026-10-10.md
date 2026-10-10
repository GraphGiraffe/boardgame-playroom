> Обновление 10.10.2026: приложение и все пять паков переходят на API игровых элементов 2. Старый интерфейс не поддерживается по решению пользователя. Перед новой UI-задачей прочитайте [GAME-ELEMENTS-API](GAME-ELEMENTS-API.md), [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md) и [TESTING](TESTING.md). Компоновкой, общими позициями и масштабированием поля управляет приложение; паки предоставляют элементы. Новые версии: UNO 0.3.0, остальные четыре 0.2.0. Опубликованный RC9 не заменяется; новая интеграция требует физической проверки перед stable.

# PlayRoom «ХОД»: короткая передача агенту · 10.10.2026

**Прочитать:** [отчёт реального теста RC8](RC8-FIELD-TEST-2026-10-10.md) → [основной roadmap, `5 и `12](PlayRoom_Roadmap_and_Agent_Handoff_2026-10-08.md) → [деплой Cloudflare](CLOUDFLARE-PAGES-DEPLOY-PLAN.md). Старые `DEVELOPER-*` описывают RC6: сверяй со свежим `dev`.

**Репозитории:** [app/core](https://github.com/GraphGiraffe/boardgame-playroom) и [игровые паки](https://github.com/GraphGiraffe/boardgame-playroom-paks). Проверить текущие `dev`/PR/CI в обоих. Снимок до этого PR: app `974c87407a92614f4520540ca51026108734f67d`, packs `796000111ce91a8505575faa2b8cf1be751981cd`. Immutable [RC8](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.15.0-rc.8): `85f4199c1d1d3b8cc17d550281d5174a1dfcded5`, [CI 466/466](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38008718811).

**Подтверждено пользователем:** две установленные PWA, рабочий вход в закрытый Cloudflare Pages после ручной загрузки исправленного password ZIP, WebRTC **PR3 с VPN off на обоих**, успешный матч до конца. **PR2/«Все» не подключился, причина неизвестна**. Host reload в этом тесте не проверяли.

## Приоритеты

1. **RC8-UX-01 [P0, БАГ]:** клиент видит лобби под *незакрываемым* окном результата; кнопки закрытия, перехода и истории не действуют. `app/shared-views.js` (`show/close/action/destroy`), `app/network-ui.js` (`attachClientLobbyListener/clientToLobby/exitClientGame`), `app/game-screen.js`. Нужен E2E: finish → result → lobby, доступность UI, следующая игра по тому же RTC. Подозрение на старый overlay — **ещё не доказанная причина**.
2. **RC8-UX-02 [P1, НОВОЕ]:** при `input` ползунка отображать *кадр*, пока палец/мышь удерживается, а не только номер; `change` — финальный кадр. `app/shared-views.js` (`historySliderInput/Change, viewHistory`), `app/game-screen.js`. Не терять drag/focus, не принимать stale RPC, не запускать звуки и не раскрывать чужие руки. Проверить и local history `app/app.js`.
3. **LAN-02 [P0, ЧАСТИЧНО]:** `app/network-client-history.js`, `app/network-session-store.js`, `app/network-ui.js`. Уже есть личные projected frames/«Мои партии»; нужны `receivedThrough/presentedThrough/reviewed`, пробелы/backfill, read-only архива после нескольких матчей.
4. **LAN-03 [P0, ЧАСТИЧНО]:** `app/multiplayer.js` (resume/seat), `app/transports/webrtc.js`, `app/session-client.js`. Добить reconnect/receipts/epoch/lease, физический сон/reload. После полного RTC restart нужен свежий Offer/Answer; zero-QR требует отдельного secure signaling. **ICE-01:** сравнить PR3/PR2 с VPN on/off без публикации SDP/секретов.
5. **DEPLOY-01 [ПЛАН]:** сейчас защищённая PWA публикуется *вручную* через Pages Direct Upload. Запланирован release SHA/checksum → проверенный password `_worker.js` → Wrangler deploy с CI-секретами/предохранителями. **Автодеплой ещё не настроен**, доступ к Cloudflare/ключам отсутствует; не отправлять в Git пароль/хэши/токены.

## Работа

Сначала [AGENTS](../AGENTS.md), [CONTRIBUTING](../CONTRIBUTING.md). `dev` → отдельная ветка → Draft PR → tests → Ready → оба точных CI → squash merge в `dev`. Базовые `bash scripts/codex/check.sh`; для сети/UI полный `bash scripts/codex/check.sh --full --packs-dir /path/to/boardgame-playroom-paks/packs`. Регрессии: `tests/network-main-app.test.cjs`, `network-host-recovery-browser.test.cjs`, `network-client-history-browser.test.cjs`, `network-reconnect-browser.test.cjs`; добавить E2E для двух новых багов (320/390 px, touch/mouse). Не менять `main`, старые теги и опубликованные паки, не добавлять обязательный Node LAN-host.
