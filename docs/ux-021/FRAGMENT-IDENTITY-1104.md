# Постоянная идентичность DOM-регионов — 4 ноября 2026

Статус: исправлено, проверено и опубликовано во временном превью. Полная GOAL0.21 остаётся открытой.

## Причина и изменение

При подготовке регионов Лудо обнаружена необходимая общая гарантия. Клетка может становиться кнопкой разрешённой цели, а другая — возвращаться в обычный span. DOM-патчер ранее сопоставлял такие корни по tag/key; служебный ID региона в key не участвовал. Поэтому вместо замены корня конкретной клетки могли переиспользоваться узлы соседних регионов.

В новом RED после обмена span/button оба прежних узла остались в DOM, хотя каждый изменил физический регион. Это не допустимое сохранение узла: вместе с ним могли перейти локальные свойства и обработчики другой клетки.

Теперь data-playroom-fragment имеет собственный namespace и приоритет в общем DOM key. Если тип корня конкретного региона изменён, заменяется его собственный узел. Узел соседней клетки не заимствуется; неизменённые регионы сохраняются. Сопоставление остальных элементов без region marker остаётся прежним. Изменена одна строка platform/web/dom.js, правила/представления/версии паков не менялись.

## Проверки

- Расширен существующий `scene fragment patches parse only changed regions and retain live input scroll and effects`: до исправления RED — A/B не retired. После Chromium1/1 и WebKit1/1 PASS: старые A/B удалены при смене типа, неизменённый C сохранил exact node; click нового A не вызывает установленный для старого B обработчик. Фокус не переходит на другую клетку.
- Сохранены прежние строгие проверки того же case: parse неизменного каркаса только1раз, разбор только изменённого B, exact input/focus/draft/caret2–5/scrollTop17/runtime style/pausedWAAPI23, восстановление потерянных региона/контейнера, смена geometry owner и свежая подготовка player-panel.
- На окончательном HTML: весь `case/checkers-drag` Chromium12/12 PASS, WebKit5/12 PASS+7CDP-touch skips. Дочерних сценариев11/4 соответственно; родительский test входит в счёт runner. Mouse/touch/cancel/обязательные и цепные взятия/анимации и nativeSupabaseRequests0/errors[] сохранены.
- На окончательном HTML: `screen:phone cached solitaire columns keep applied skins through subsequent commands` Chromium1/1 PASS, обе игры Spider/Klondike.
- git diff --check для изменённых DOM/test/doc файлов: exit0. Build8SHA256/3ZIP CRC/source248runtime-locale-test файлов совпали. Из230runtime-файлов изменён только dom.js;229прежних, все pack sources и companion совпали.

Это доказательство новой границы физической идентичности и перечисленных игровых сценариев. Нет утверждения, что проверены все возможные корневые теги, перестановки, роли и события во всех играх.

## Публикация

HTML SHA256 `886c270c277e6a848f6395d59d776249f1215c08171b8aafb28a190f24b5efaf`.

Cache `playroom-pwa-v0.21.0-preview.1-4da0395728977d06`; collection0.8.9-preview.5, Checkers0.5.5-preview.4, companion `0f4c38bddb03ccdc0bd32d780ea378322f8b403bd7255b452ce82b73cbf86604`. Разрешённые временные Funnel443/8443 и `/hod-021.html` обновлены. Четыре публичных файла побайтно совпали; standalone проверен полностью64KiB ranges с206/Content-Range/length.

Live Chromium: worker activated, ожидаемые cache/buildIdentity,15игр,downloadProtocol1,errors[],nativeSupabaseRequests0,sourceDrift[]. Offline reload/coldPage/Domino/save/profile PASS;6состояний390×844/844×390 без overflow. Static Funnel по-прежнему не предоставляет `/api/packs/catalog`; встроенные паки доступны. Stable Pages/R2/SQL и посторонние службы не менялись.

Превью: https://seth.tail6aebd4.ts.net/ ; также8443 и `/hod-021.html`.

[Evidence](../../../tmp_files/ux-021/fragment-identity-1104/): source-state.json,final-manifest.json,own-changes.patch,executed-layout.test.cjs,drag-chromium/webkit.log,drag-*/checkers-*.json,solitaire.log,public-check.json,funnel-before/after.txt,live-pwa/chromium-report.json. RED и оба адресных browser PASS записаны в результатах команд; отдельные RED/engine-specific журналы механизма не создавались.

## Продолжение

Начатый разбор Лудо показал статические клетки и динамические фишки/цели, но его renderer **ещё не перенесён на регионы**. Эта правка закрывает выявленную предпосылку безопасной миграции. Остаются миграция других сцен, внешний recipe/dirty dependencies, измерение общей задержки, полная A01–A36 функциональная и пользовательская приёмка, физические устройства/сети/AT. Цель0.21 не сужается до данного исправления и её открытые требования не переносятся автоматически в следующий SDK-релиз.
