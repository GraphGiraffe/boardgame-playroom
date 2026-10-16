# Разработчику ХОД · 0.18

Опубликованная версия 0.17.6 работает с коллекцией 0.6.5; сведения о выпуске — в [RELEASING](RELEASING.md). Реализация кандидата 0.18.0-rc.5 / 0.7.0-rc.4 — в [SDK](SDK-0.18.md) и [реестре приёмки](REFACTOR-0.18-TRACKER.md). Остальные требования — в [Roadmap](ROADMAP.md).

| Задача | Документ | Основные исходники |
| --- | --- | --- |
| Слои и загрузка | [Архитектура](DEVELOPER-ARCHITECTURE.md) | index.html, app/app.js, core/ |
| UI и жесты | [Интерфейс](DEVELOPER-UI.md), [дизайн](UI-DESIGN-SYSTEM.md) | app/game-screen.js, app/shared-views.js, core/input.js |
| Правила и история | [Игровой цикл](DEVELOPER-GAMEPLAY.md) | core/engine.js, core/model-runtime.js, core/session.js, core/authority.js |
| Сеть и восстановление | [Сетевой контракт](DEVELOPER-MULTIPLAYER.md) | application/rooms.js, application/session-access.js, app/multiplayer.js, app/network-ui.js, app/transports/webrtc.js |
| Приглашения | [Pairing](DEVELOPER-PAIRING.md) | app/pairing.js, app/acoustic-pairing.js, app/qr-scanner.js |
| Сохранения и паки | [Данные](DEVELOPER-DATA.md) | application/library.js, platform/web/session-store.js, application/host-recovery.js, app/network-client-history.js, core/packs.js |
| Проверки и релиз | [Workflow](DEVELOPER-WORKFLOW.md), [выпуск](RELEASING.md) | scripts/codex/, build.py, .github/workflows/ |

## Первичные контракты

- [PACKS](PACKS.md): правила, события, приватность, жесты.
- [PACK-FORMAT](PACK-FORMAT.md): контейнер и версии.
- [GAME-ELEMENTS-API](GAME-ELEMENTS-API.md): дескрипторы UI API 2.
- [MULTIVIEW](MULTIVIEW.md): audience, surface, история.
- [LAN-01](LAN-01-SESSION-STORE.md): durable commit и хостовое восстановление.
- [Руководство автора](https://github.com/GraphGiraffe/boardgame-playroom-paks/blob/v0.6.5/docs/AUTHORING.md): runnable private-counter и полный цикл сборки.

При работе с правилами сверяйтесь с точной версией пака. При диагностике «не могу ходить» проверяйте legal actions, viewer, состояние pending-команды и блокировку ввода, а не только обработчик DOM. Стол имеет видимость Зрителя (viewer=-1), включая рубашки/лица рук по общему режиму; actor и права на публичные действия проверяются отдельно. Приватные действия — на личном устройстве. Текущий срез и ограничения сетевого подключения — MULTIVIEW.md.

## Дополнения RC.4

Актуальные контракты каталога, лобби, персональных настроек, scroll-поля, индикаторов, событий и приватности: [RC4-CONTRACTS](RC4-CONTRACTS.md). Новые реализации должны соблюдать эти требования совместно с основным контрактом.

## Разработка 0.18

[Утверждённый план](AUDIT-0.18.md), [реестр сохранности функций](REFACTOR-0.18-TRACKER.md), [целевые контракты и первый перенос](REFACTOR-0.18-CONTRACTS.md). Ветки refactor/0.18-* не являются опубликованным API.

Точка входа нового чата: [состояние разработки и передача 0.18](HANDOFF-0.18.md), [готовое первое сообщение](START-NEXT-CHAT.md).
