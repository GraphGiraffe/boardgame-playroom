# Разработчику ХОД · 0.16

Исходники версии 0.16.1 работают с коллекцией 0.5.1; детали выпуска описаны в [0.16](RELEASE-0.16.md). Предыдущая стабильная пара — 0.15.0 / 0.4.0; незавершённые требования — в [Roadmap](ROADMAP.md).

| Задача | Документ | Основные исходники |
| --- | --- | --- |
| Слои и загрузка | [Архитектура](DEVELOPER-ARCHITECTURE.md) | index.html, app/app.js, core/ |
| UI и жесты | [Интерфейс](DEVELOPER-UI.md), [дизайн](UI-DESIGN-SYSTEM.md) | app/game-screen.js, app/shared-views.js, core/input.js |
| Правила и история | [Игровой цикл](DEVELOPER-GAMEPLAY.md) | core/engine.js, core/session.js, core/authority.js |
| Сеть и восстановление | [Сетевой контракт](DEVELOPER-MULTIPLAYER.md) | app/multiplayer.js, app/network-ui.js, app/transports/webrtc.js |
| Приглашения | [Pairing](DEVELOPER-PAIRING.md) | app/pairing.js, app/acoustic-pairing.js, app/qr-scanner.js |
| Сохранения и паки | [Данные](DEVELOPER-DATA.md) | app/library.js, app/network-session-store.js, app/network-client-history.js, core/packs.js |
| Проверки и релиз | [Workflow](DEVELOPER-WORKFLOW.md), [выпуск](RELEASING.md) | scripts/codex/, build.py, .github/workflows/ |

## Первичные контракты

- [PACKS](PACKS.md): правила, события, приватность, жесты.
- [PACK-FORMAT](PACK-FORMAT.md): контейнер и версии.
- [GAME-ELEMENTS-API](GAME-ELEMENTS-API.md): дескрипторы UI API 2.
- [MULTIVIEW](MULTIVIEW.md): audience, surface, история.
- [LAN-01](LAN-01-SESSION-STORE.md): durable commit и хостовое восстановление.
- [Руководство автора](https://github.com/GraphGiraffe/boardgame-playroom-paks/blob/v0.5.1/docs/AUTHORING.md): runnable private-counter и полный цикл сборки.

При работе с правилами сверяйтесь с точной версией пака. При диагностике «не могу ходить» проверяйте legal actions, viewer, состояние pending-команды и блокировку ввода, а не только обработчик DOM. Публичный Стол имеет viewer=-1 и не получает приватную руку или управление.

## Дополнения RC.4

Актуальные контракты каталога, лобби, персональных настроек, scroll-поля, индикаторов, событий и приватности: [RC4-CONTRACTS](RC4-CONTRACTS.md). Новые реализации должны соблюдать эти требования совместно с основным контрактом.
