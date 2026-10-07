# Изменения

## 0.15.0-preview.3 — 2026-10-07

- После удаления последней партии, которая требовала сохранённую конфликтующую копию встроенного пака, Playroom возвращается к текущему встроенному паку и очищает устаревшее предупреждение.
- Стабильный ID профиля больше не используется как ID живого участника удалённой комнаты; две вкладки одного браузерного профиля могут быть хостом и клиентом одновременно.
- Preview комнаты показывает человекочитаемые параметры правил по строкам: игра, режим хоста, набор правил, стартовый размер руки, настройки пака и открытые/закрытые руки.
- Значения настроек берутся из метаданных пака, поэтому `manual` отображается как «Вручную · можно ошибаться».
- Добавлены регрессии для reconciliation паков, same-profile join и читаемого network preview.


## 0.15.0-preview.2 — 2026-10-07

- Добавлена installable PWA-сборка: manifest, Service Worker и offline app-shell.
- Pairing можно передавать через Web Share; установленный ХОД регистрируется как Web Share Target.
- Добавлен custom protocol handler `web+playroom:` для открытия pairing-ссылок напрямую в PWA.
- Offer/answer получили `pairingId`; ответ от старого приглашения отвергается до WebRTC negotiation.
- SDP скрыт из основного UX; copy/paste сохранён только как fallback.
- Исправлен перенос длинных сетевых уведомлений/toast на мобильных экранах.
- PWA-функции требуют HTTPS (или localhost для разработки); Web Share/Share Target/protocol handlers используются только при наличии поддержки браузером.


## 0.15.0-preview.1 — 2026-10-07

- Первый минимально тестируемый browser-to-browser multiplayer: основной Playroom на двух устройствах, WebRTC DataChannel, ручной offer/answer pairing, лобби, цветные места, ready и 3-секундный старт.
- Имя игрока при первом запуске, название комнаты, зрители, kick и уведомление при изменении правил.
- Удалён отдельный Node/HTTP LAN-host preview; хост теперь обычная вкладка основного приложения.
- На этом preview reconnect и локальный архив сетевой истории ещё не входят в приёмку.


## Unreleased — authority / responsive preview

- Add a DOM-independent SessionAuthority, projected client snapshots/history and command identity/revision validation with retry deduplication.
- Route local actions/bots through authority; filter shell footer/history/badges/notifications through the audience projection.
- Extend portable view registration with optional table/player surfaces, preserved on version activation and rollback.
- Scale component art uniformly; support optional compact pack artwork with main fallback and canonical card backs.
- Add isolated view-only client, MessagePort harness, trusted-LAN Node preview, packaging and device acceptance guide.
- Preserve local modes, save formats and independent releases. LAN persistence, production rooms and physical-device acceptance remain deferred.

## Не выпущено

- Подготовка Codex Cloud: переносимые setup/check/serve, закреплённые зависимости, поиск системного или управляемого Playwright браузера.
- Независимые проверки приложения и явный полный режим с внешними паками; CI использует те же команды.
- AGENTS.md и инструкция создания окружения с двумя репозиториями.

## 0.13.0

- Приложение, движок и игровые паки разделены по ответственности и репозиториям.
- Установка и обновление офлайн-паков через интерфейс, проверка API и сохранение прежних версий.
- Партии и повторы привязаны к версии пака; старые сохранения прототипа используют 0.1.0.
- Общие анимации и подсказки перенесены в core; специальные правила и раскладки принадлежат пакам.
- Отдельные сборки: базовое приложение без игр и удобный HTML с пятью начальными паками.
- Добавлен план документации и гайдлайнов авторов игр. Сетевой мультиплеер остаётся в плане.
