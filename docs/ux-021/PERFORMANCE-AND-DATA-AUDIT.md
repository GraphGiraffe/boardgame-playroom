# Аудит повторных действий, копий и передачи данных

02.11.2026. Проверены конкретные frontend/render и application/RPC/provider
цепочки. Измеренные исправления отделены от необходимых границ и кандидатов
следующего исследования. Production, DDL и сетевой wire format не менялись.

| Цепочка | До → после | Сохранённый контракт |
|---|---|---|
| RoomChat.read с80ответами/101записью |81чтение истории и81resolve →1+1; обработка2,116,854→26,134B | Свежий request-local context/index, first-occurrence semantics, team/private filtering; live public project остаётся свежим для каждого получателя. Wire25,926B не изменился |
| Автосохранение3партий | Внутри batch3list→1; полный UI scan4list→2;3PUT остаются | Предварительный display-read сохранён. Conditional revision, quota, account generation, partial retry и неизменённые bytes проверены |
| Native fullscreen/resize |8лишних повторных замен title за3resize→0 | Scene DOM сохранён; требуемые layout passes при реальном изменении viewport остаются |
| Геометрия SVG обложек |5outerHTML чтений/388,400символов временной сериализации→0на cache hits | WeakMap+локальный observer/takeRecords; same-node mutations инвалидируют cache; text/textPath/foreignObject измеряются без cache;0BBox не кешируется |
| Подготовка заголовка | Повторная нормализация→0childList/attribute writes; те же SVG/Back nodes | Glyph/title/порядок меняются только при различии; generic prepaint callback инъецирован в existing host state |
| Ручной refresh Моих партий | Возврат в тот же pending список использует одно чтение | Old completion не меняет новую кнопку/аккаунт/root; данные остаются видимыми; cloud refresh использует существующий job |

Для SVG измеренная сериализация занимала около1.2ms в одном наблюдении порядка
496ms. Это устранение лишней работы и копий; не основной CPU hotspot и не
доказательство конкретного ускорения телефона. CPU samples layout/getBBox —
профиль одного локального запуска, не счётчики всех render вызовов.

## Сохранённые необходимые операции

- Приватные проекции и уведомления отдельным получателям сохраняют проверку
  полномочий, адресацию и изоляцию mutable subscriber данных.
- Повторный progress read после async boundary защищает обновившиеся history
  holes; успешное первое чтение не разрешает пропустить проверку перед записью.
- Независимые upload batches и manual uploads получают свежие metadata;
  глобального кэша, пропуска захвата данных или серверного revision check нет.
- В RPC list передаются metadata, get получает одну разрешённую архивную запись;
  heartbeat возвращает пустой ответ. Полные archive bytes остаются в явном
  upload/download, а не добавляются к обычному списку.
- Авторские SVG preview и drag ghost — локальные presentation snapshots,
  требуемые интерфейсом, с неинтерактивным содержимым и ограниченным lifetime.

## Кандидаты без заявления об исправлении

1. SQL hub сначала получает basic friends aggregate из social list и заменяет
   его расширенным. Это структурная возможность убрать повторный scan; актуальная
   стоимость SQL/план не измерялись. Перед изменением нужны localPG сравнение
   результата/ACL и оценка стоимости. SQL в этой ревизии оставлен прежним.
2. Повторное кодирование одинаковой public presence projection — возможная
   CPU-оптимизация; затраты не измерены. Отдельные sends/получатели и защитные
   subscriber copies сохраняют необходимые свойства.

Подробный inventory и source/evidence:
[backend/data](BACKEND-DATA-REDUNDANCY-AUDIT.md),
[frontend](UI-PLATFORM-ITERATION03.md),
[приёмка ревизии](OWNER-ITERATION-03-ACCEPTANCE.md).
Суммарное отсутствие любых повторов во всех строках проекта не утверждается.
