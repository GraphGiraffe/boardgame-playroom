# Архитектура PlayRoom 0.18

Production остаётся 0.17.6 / 0.6.5. Кандидат 0.18.0-rc.1 / 0.7.0-rc.1 использует новый API 3 и protocol 2. Источники приложения и 12 игр выпускаются независимо. Приёмка и статус публикации — [реестр](REFACTOR-0.18-TRACKER.md).

## Слои

| Слой | Владелец | Зависимости |
| --- | --- | --- |
| Domain игры | packs/*/domain, shared/domain | JSON, явные RNG/domain ports; без UI/сети/хранилища |
| Runtime | core/model-runtime, events, history, session-codec, command-processor, journal | чистые переходы, проверка, проекции, staging/receipts |
| Application | application/rooms, host-session-service, history-sync-service, client-connection-service, recovery-coordinator, library | порты часов, ID, транспорта, persistence и уведомлений |
| Presentation | presentation/, пак presentation/scene + locales | семантические SceneModel, MessageRef, metrics, показ |
| Web | app/, platform/web/, HTML/CSS helpers в core/ui/input/motion | DOM, жесты, WebRTC, IndexedDB, WebLocks, Worker, звук |

Engine и GameModel не импортируют Web. Существующее имя каталога core у Web helpers не делает их частью domain; они не входят в граф зависимостей правил. Другой клиент может заменить renderer, ввод, persistence/transport ports, сохранив JSON контракт GameModel/Session. JS остаётся без UI framework.

## Единый источник

Оба builder используют canonical pack_compiler (SHA закреплённая копия в приложении). Shared колода, RoundToken, token-layout, компоненты/звуки и palette/skin catalog имеют исходник в packs/shared и host SHA lock. Не копировать правила в UI и геометрию ассета по разным экранам. Стили пака ограничены его сценой; общая раскладка, ввод и карточки принадлежат хосту.

## Сессия, сеть и история

Хост владеет Session/authority. Команда проходит общие prepare → durable commit → receipt/ACK; повтор commandId не создаёт второе действие. Клиент получает только свою проекцию. Resume-токены не входят в room snapshot/QR/client journal. Журнал, locks, восстановление authority и client backfill отделены от Web доступа к хранилищу.

GameScreenController/HistoryController общие для локального, сетевого и архивного UI; отличается порт/политика доступа. Стабильный DOM patch сохраняет scroll/focus/уже начатую прокрутку. Показ кадров сериализован; пришедшая сеть не отменяет обязательное время просмотра. Replay не раскрывает будущую или чужую скрытую информацию.

Revision обозначает действие, timeline — ход, а объявленный паком round — раунд. Точки/черточки и переходы истории используют сохранённые границы. Стол всегда имеет viewer=-1 и может получать отдельно разрешённого actor только для public choices. Личный экран без поля существует только у подключённого сетевого игрока при наличии Стола.

## Оформление и тексты

Неизменяемые light/dark и пользовательские темы хранятся локально. Материалы/скины не меняют правила, значения/тайну компонентов или других клиентов. В редакторе главного меню создают пресеты, в toolbar выбирают их в том числе во время партии. Все пользовательские русские тексты/aria лежат в JSON, форматируются Translator; подписи не участвуют в командах/RNG.

## Граница обновления и поставки

Новый runtime не исполняет API 1/2 и отклоняет смешанный network protocol. Notice полного обновления позволяет выгрузить данные; старые сохранения не удаляются и требуют прежнего приложения/точного пака. Установленный JavaScript пака доверенный: staging не является sandbox.

App, collection и один пак публикуются независимо. RC имеет отдельный R2 channel и Pages preview. SHA файлов, защищённый доступ/offline и неизменность production runtime/catalog/canonical deployment проверяются при публикации. Само создание GitHub Release не доказывает деплой.
