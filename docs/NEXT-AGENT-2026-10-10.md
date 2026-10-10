# PlayRoom «ХОД» — быстрый handoff после RC8 / 10.10.2026

**Прочитай сначала:** [RC8: физическая проверка и дефекты](RC8-FIELD-TEST-2026-10-10.md) → [LAN roadmap, раздел 5](PlayRoom_Roadmap_and_Agent_Handoff_2026-10-08.md) → [DEPLOY-01](CLOUDFLARE-PAGES-DEPLOY-PLAN.md) → [NETWORK-UX-PLAN](NETWORK-UX-PLAN.md). Не принимай разделы «RC1/RC6» старых документов за актуальный статус.

## Факты и ветки

- Репозитории: [приложение](https://github.com/GraphGiraffe/boardgame-playroom) (прежде всего `dev`) и [паки](https://github.com/GraphGiraffe/boardgame-playroom-paks) (`dev`). Проверяй **свежие SHA, PR и CI**, не полагайся на этот снимок: приложение `dev` до документационных правок `974c87407a92614f4520540ca51026108734f67d`, паки `dev` `796000111ce91a8505575faa2b8cf1be751981cd`.
- Последний подтверждённый pre-release приложения: [`v0.15.0-rc.8`](https://github.com/GraphGiraffe/boardgame-playroom/releases/tag/v0.15.0-rc.8), SHA `85f4199c1d1d3b8cc17d550281d5174a1dfcded5`; [CI 466/466](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38008718811). Релизная ветка ≠ текущий `dev` по version metadata. Не переписывай тег, `main` или опубликованные версии паков.
- Физически подтверждены: два PWA, парольный Cloudflare Pages после исправления Worker, WebRTC **PR3 при выключенном VPN у обоих**, партия до конца. **PR2/«Все соединения» не подключилось — причина неизвестна**.
- RC8 **не прошёл полноценную UX-приёмку**: клиентское модальное окно результата осталось поверх уже открывшегося лобби; `Close`/`Lobby`/`History` не работали; история должна показывать кадр **по `input` во время drag**, а не только по `change` после отпускания.

## Очередь конкретных задач

1. **RC8-UX-01 [P0]**: убрать застрявший модальный результат при возврате клиента в лобби; обеспечить доступность кнопок, отсутствие старого overlay и продолжение следующего матча по прежнему RTC. Код: `app/shared-views.js` `show/close/action/destroy` + `app/network-ui.js` `attachClientLobbyListener/clientToLobby/exitClientGame`, `app/game-screen.js`. Добавь двухбраузерный E2E с завершением матча. Вероятный lifetime-баг `destroy`→`modal` ещё **не доказан**.
2. **RC8-UX-02 [P1]**: render исторического состояния при движении slider с зажатым пальцем/мышью, без stale RPC, потери pointer capture/drag, live эффектов и чужих рук. Код: `app/shared-views.js` `historySliderInput/Change/viewHistory` + `app/game-screen.js` `historyMarkup`. Текущее поведение `input` обновляет только badge — оно **не** соответствует новому пожеланию.
3. **LAN-02 [P0, частично]**: `app/network-client-history.js`, `app/network-session-store.js`, `app/app.js`, `app/network-ui.js`; закончить `receivedThrough/presentedThrough/reviewed`, пропуски и backfill, read-only историю последовательных матчей. Не превращать клиентский архив в полную Session.
4. **LAN-03 [P0, частично]**: `app/multiplayer.js` `ResumeStore/RoomService`, `app/transports/webrtc.js`, `app/session-client.js` и `network-ui.js`; восстановление seat/receipts/authority epoch и диагностика разрыва. После полного закрытия RTC **нужен свежий Offer/Answer**, а для auto zero-QR ещё требуется отдельный безопасный signaling (не подменяй HTTPS-хостинг сигналингом). **ICE-01**: повторить PR2 vs PR3 с VPN on/off и логировать безопасную ICE-диагностику, без приватных токенов.
5. **DEPLOY-01 [отдельно]**: в текущем Cloudflare Pages **вручную загружен защищённый password ZIP**, из GitHub он не выкладывается. Спроектировать и затем реализовать проверенный immutable-release → secure `_worker.js` → Wrangler Pages Direct Upload, с секретами и smoke-гейтом; до их настройки **нет автоматической публикации**. Подробности в [DEPLOY-PLAN](CLOUDFLARE-PAGES-DEPLOY-PLAN.md).

## Где проверять

- Начни с корневых [AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md) и [DEVELOPER-INDEX](DEVELOPER-INDEX.md) (последний описывает историческую RC6-базу).
- Релевантные тесты: `tests/network-main-app.test.cjs`, `tests/network-next-match.test.cjs`, `tests/network-host-recovery-browser.test.cjs`, `tests/network-client-history-browser.test.cjs`, `tests/network-reconnect-browser.test.cjs`, `tests/pairing-methods-browser.test.cjs`. Добавь **новые** проверки воспроизведения двух найденных дефектов, не удаляй старые assertions ради зелёного CI.
- `bash scripts/codex/setup.sh`, `bash scripts/codex/check.sh`; полный прогон при UI/сети/сохранениях: `bash scripts/codex/check.sh --full --packs-dir /path/to/boardgame-playroom-paks/packs`. Зафиксируй точный SHA обоих репозиториев, мобильную ширину 320/390 px, touch+mouse и результаты на физических PWA.
- Workflow: новая task-ветка от `dev` → Draft PR → локальные тесты → Ready → обязательные `Application checks` + `Multiplayer preview smoke` на **финальном SHA** → squash merge в `dev`. Stable `main`/published packs/секреты не трогать. Новую RC публиковать только отдельным проверенным выпуском.

**Не делать без проверки:** заявлять PR2 как сломанный из-за VPN, считать результат/drag уже исправленными, писать пароли/хэши/ключи в Git, копировать старый Node LAN-host из документов 07.10, считать внешний Cloudflare Pages сервером игрового authority.
