# Изменения

## 0.15.0-preview.3 — 2026-10-08

- Сообщение о недоступной старой версии пака удаляется после удаления проблемного сохранения; менеджер паков проверяет актуальные ссылки сохранённых партий.
- Подключение из другой вкладки того же браузера создаёт отдельного участника. Сетевой вход не принимает общий ID браузерного профиля как полномочие места/хоста.
- Правила комнаты видны строками с названиями настроек и читаемыми вариантами из пака (например, «Объявление UNO: Вручную · можно ошибаться») вместо внутренних значений `manual`.
- Регрессионные проверки покрывают независимые ID участников, подписи правил и UI приглашения.
- PWA/WebRTC и ручной pairing из preview.2 сохранены. Восстановление сетевой партии после перезапуска вкладки ещё не реализовано.


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
