# Разработчику ХОД

Карта кода и действующих контрактов приложения. Начните с [локального запуска и проверок](TESTING.md) и [правил внесения изменений](../CONTRIBUTING.md).

| Задача | Документация |
|---|---|
| Найти модуль и его владельца | [Архитектура](DEVELOPER-ARCHITECTURE.md) |
| Разобраться в модели, командах, событиях и проекциях | [Контракт runtime](SDK-0.18.md), [механики](MECHANICS.md) |
| Создать и проверить пак в изоляции | [Локальная SDK-студия](PACK-SDK-STUDIO.md) |
| Подключить пак | [Формат контейнера](PACK-FORMAT.md), [ресурсы коллекции](https://github.com/GraphGiraffe/boardgame-playroom-paks/blob/main/docs/README.md) |
| Изменить игровой интерфейс | [UI API](GAME-ELEMENTS-API.md), [зоны экрана](PACK-SDK-LAYOUT.md), [исполнение представления](PRESENTATION-PLAYER.md) |
| Соблюсти общий стиль | [Дизайн](UI-DESIGN-SYSTEM.md), [размеры](SIZE-SYSTEM.md), [масштаб](INTERFACE-SCALE.md) |
| Добавить правила и обучение | [Правила](RULEBOOK-LAYOUT.md), [обучение](TUTORIALS.md) |
| Работать с сохранениями и версиями | [Данные](DEVELOPER-DATA.md), [локальное хранение](LOCAL-STORAGE.md), [облачные сохранения](CLOUD-SAVES.md), [перенос](SAVE-TRANSFER.md) |
| Работать с сетью и восстановлением | [Сеть и роли](DEVELOPER-MULTIPLAYER.md), [сетевой сервис](NETWORK-SERVICE.md), [обмен данными](NETWORK-PERFORMANCE.md) |
| Понять обновление приложения | [PWA](PWA-UPDATES.md), [приоритет версий паков](PACK-VERSION-PRIORITY.md) |
| Использовать realtime-взаимодействия | [Realtime SDK](REALTIME-SDK.md) |
| Изменить пасьянсы или карточные скины | [Реализация пасьянсов](SOLITAIRE-IMPLEMENTATION.md) |
| Выбрать проверки и избежать повторной ошибки | [Локальные проверки](TESTING.md), [инварианты](DEVELOPMENT-REGRESSIONS.md) |

Контракты: engineApi 4, viewApi 3, сетевой protocol 3. Историческое имя файла `SDK-0.18.md` сохранено для совместимости ссылок. SDK-студия и browser player используют общий изолированный runtime; [инструкция SDK](PACK-SDK-STUDIO.md) различает исходники, source-export, installable pack и отдельно опубликованное приложение.
