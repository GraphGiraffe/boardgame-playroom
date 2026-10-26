# Разработчику ХОД · 0.19

Действующий контракт: приложение **0.19.5**, коллекция **0.8.5**, engineApi **4**, viewApi **3**, сетевой protocol **3**. Источники и фактическое состояние публикации — [RELEASE-0.19](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/RELEASE-0.19.md). История разработки доступна в Git и CHANGELOG; промежуточные API не являются частью SDK.

| Вопрос | Руководство |
|---|---|
| Где находится код и как взаимодействуют слои | [Архитектура](DEVELOPER-ARCHITECTURE.md) |
| Как добавить обучение и сохранить прогресс пользователя | [Обучение](TUTORIALS.md) |
| Как назвать и использовать общую механику | [Реестр механик](MECHANICS.md) |
| Модель, команды, события, проекции, история | [SDK](SDK-0.18.md) |
| Сцена, жесты и фиксированная компоновка | [UI API](GAME-ELEMENTS-API.md) |
| Визуальные правила, ассеты и скины | [Дизайн](UI-DESIGN-SYSTEM.md) |
| Масштаб и дискретные слайдеры | [Настройки](INTERFACE-SCALE.md) |
| Роли, authority, Стол, reconnect | [Сеть](DEVELOPER-MULTIPLAYER.md) |
| Хранение, точные версии, обновление | [Данные](DEVELOPER-DATA.md) |
| Контейнер и сборка пака | [Формат](PACK-FORMAT.md) |
| Проверки и выпуск | [Тесты](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/TESTING.md), [релиз](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/RELEASING.md) |
| Пасьянсы и наследование скинов в рабочей ветке | [Реализация](SOLITAIRE-IMPLEMENTATION.md) |
| Защита от повторных ошибок: ассеты, сохранения, скины, жесты | [Инварианты и проверки](DEVELOPMENT-REGRESSIONS.md) |
| Ближайшие патчи | [Roadmap](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/ROADMAP.md), [подготовка расширений](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/NEXT-PATCHES.md) |

Автор пака начинает с [руководства коллекции](https://github.com/GraphGiraffe/boardgame-playroom-paks/blob/main/docs/AUTHORING.md). Все примеры относятся к текущему API. Новая механика сначала получает владельца слоя и понятное имя; игровое правило не переносится в Web renderer.

Мобильные контракты 0.18.4: [размеры](SIZE-SYSTEM.md), [навигация и установка](NAVIGATION-AND-INSTALL.md), [приоритет тестовых версий](PACK-VERSION-PRIORITY.md).
