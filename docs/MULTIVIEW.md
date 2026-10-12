# Проекции и поверхности 0.15

[API паков](PACKS.md) · [UI API 2](GAME-ELEMENTS-API.md) · [сеть](DEVELOPER-MULTIPLAYER.md)

| Понятие | Назначение |
| --- | --- |
| viewer | Игровой индекс, задающий права на данные; -1 — публичный зритель |
| surface | combined, player или table: способ размещения разрешённых элементов |
| project | Удаление секретов до передачи/рендера |
| history | Кадр той же разрешённой проекции в режиме read-only |

Пак регистрирует render и при необходимости surfaces.table/player через PlayroomViews.register. Каждый renderer возвращает api:2, family, playerContent и elements; GameScreen выбирает расположение и размеры. Дескрипторы playerContent индексированы исходными playerIndex; относительный порядок противников меняется только в DOM.

Public table не получает hand/actions и не должен помещать личное управление в field. combined/player используют тот же контракт и разрешённую руку. Смена поверхности не повышает права viewer. Пак фильтрует свои произвольные секреты в project; удаление кнопки из UI не является фильтром данных.

SessionAuthority выдаёт snapshots и history для закреплённого viewer. SharedViews использует общий GameScreen и Input, но архивный просмотр не dispatch-ит действия. Live-события, анимации replay и результаты различаются; результат завершённой партии не теряется при выборе начального кадра.

Для проверки используйте учебный [private-counter](https://github.com/GraphGiraffe/boardgame-playroom-paks/tree/v0.4.0/examples/private-counter): цель видна только владельцу, публичный счётчик всем. Dev-сервер может показывать несколько поверхностей для проверки, но production authority работает в браузере хоста.
