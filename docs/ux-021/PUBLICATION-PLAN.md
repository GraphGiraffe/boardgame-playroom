# Предложение публикации кандидата 0.21

Статус: штатная публикация и production SQL не выполнялись. По отдельному поручению
владельца доступно временное HTML-превью через Funnel; это не релиз и не полная PWA. Предыдущий goal-turn был прогрессом, а не ожиданием: исправлены
fullscreen/tutorial/упаковка и закрыт связный handoff→bot→result→lobby proof.

## Точная площадка

Основная текущая площадка по canonical utils —
https://graphgiraffe.github.io/playroom-hod-test/
(`GraphGiraffe/playroom-hod-test`, branch main). Read-only Pages API 02.11.2026
подтвердил html_url, build_type=workflow, source.branch=main и HTTPS enforced.
CLI-журнал: boardgame-playroom-utils/.playroom-utils/runs/20261102T063249-3ae77116/.
Distribution checkout чистый, HEAD8c423425a8519bcc811c9fd58a2843f1b2642b20
с записью публикации0.20.0/коллекции0.8.8. README версии0.19.10 устарел; его номер
не использован как факт текущего runtime. Live application version этим Pages API
не проверялась.

В этом workflow нет входа branch/channel preview: только ручная публикация main.
Предлагаемая операция заменит приложение на существующей главной странице,
а не создаст отдельный URL. Cloudflare имеет другой, отдельный workflow/channel;
он не меняется автоматически. Изолированный CF preview не объявляется уже готовым.

## Что предлагается после отдельного поручения

1. Выпустить текущий проверенный UI как0.21.0-preview.1: обновить только release
   metadata/заметки, сохранить точные app/pack исходники и их provenance.
   Текущий локальный кандидат уже имеет номер0.21.0-preview.1; точный HTML,
   SHA и source provenance указаны в LOCAL-CANDIDATE.md (актуальный срез).
   Это не опубликованный выпуск. При публикации фиксируются точные bytes;
   содержимое уже опубликованной версии нельзя незаметно заменять.
2. Изолировать предназначенные изменения в task/PR по правилам репозиториев,
   сохранив соседние dirty работы; не включать всё рабочее дерево вслепую.
   Подготовить один точный immutable app/pack companion, build/SHA/ZIP.
   Незатронутые уже зелёные source tests не повторять.
3. Для полноценной онлайн-приёмки — read-only baseline preflight и только
   совместимые narrow SQL upgrades из SERVER-ROLLOUT-MANIFEST.md
   (2обязательных,2условных Push). Не использовать full schema как замену
   неизвестному baseline. При несовпадении baseline остановиться до изменений.
4. Обновить encrypted input и pack catalog existing distribution repository,
   сохранив source/salt.txt и доступ пользователей. Reseal меняет transport key,
   поэтому сначала убедиться в отсутствии активной публикации; не делать это
   в рамках текущей read-only подготовки. Plaintext source/ZIP, пароли и ключи
   в публичный репозиторий не загружаются.
5. Выполнить единственный разрешённый Pages workflow, сохранить его run ID,
   дождаться terminal и проверить actual deployed metadata/encrypted bytes,
   catalog hashes, remembered login/offline/update. Сбой smoke не означает
   отсутствия публикации: сначала проверить существующую операцию.
6. Передать владельцу живую ссылку и OWNER-ACCEPTANCE.md для реальных телефонов.
   Установка/OSkeyboard/системный текст/Push/NAT остаются отдельной приёмкой.

## Почему сейчас требуется решение

playroom/AGENTS.md: «Релиз/публикация требуют отдельного поручения». Навык
app-release-pages также требует actual request для preview. Данная задача
разрешает реализацию и локальную подготовку, но отдельного поручения на новую
публикацию0.21 в текущей сессии нет. Подготовка, сборка и локальные исправления
выполнены до этого вопроса; повторной неопределённой «проверки готовности» не нужно.

Доступные решения: публикация интерфейса и совместимого сервера; публикация
только интерфейса с явно gated новыми server capabilities; либо сохранить
локальную сборку до дальнейшего решения. Важные update-Push operator-only,
само разрешение публикации не разрешает такую рассылку.
