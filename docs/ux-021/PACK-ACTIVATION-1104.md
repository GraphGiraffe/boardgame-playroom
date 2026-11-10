# Идемпотентная активация паков — 4 ноября 2026

Статус: исправлено, проверено в исходниках/собранном HTML и опубликовано во временном превью. Текущий HTML8b9cad; общая GOAL0.21 открыта.

## Изменение

В core/packs.js `_apply` проверяет реальные активные rules/version, render/cover/reveal/tutorial/seating/surfaces и каталог, а не только номер версии. Если установленные регистрации совпадают, повторный activate не регистрирует их заново и сохраняет live view identity. Проверка CSS и восстановление изменённого stylesheet остаются. При расхождении регистраций, переключении версии или отсутствии каталога работает прежний путь активации с rollback.

Новый глобальный кэш и удержание приватной разметки не добавлялись. Descriptor и дальнейшая сцена пока строятся прежним способом.

## Проверки

Существующий packs-reconcile сценарий расширен проверкой identity/отсутствия повторной регистрации, восстановления заменённых rules/view, переключения1.0→1.1→1.0 и reveal после возврата. До исправления: RED на сохранении live renderer identity. После: case/packs-reconcile4/4PASS, skipped0.

case/view-contract11/11PASS, skipped0: реальные registry/engine, surfaces, версия, переносимость и rollback при отказе регистрации. Начальная попытка объединить названия через `|` не выбрала ни одного теста и не считается успешной проверкой; затем выполнен весь небольшой case.

Точный HTML `8b9cad73c30cd8739c162b26494b6b7867f90d81a045a7a255afe957e3e50da4`: настоящий Spider move0→1, rendererIdentityStabletrue, busyfalse, errors[]. Один полный recipe10колонок/54карты остаётся. Longtask97мс; этот случай со случайным seed не является контролируемым сравнением с прежними95мс и не доказывает ускорения.

Build:8SHA256,3ZIP CRC, source ZIP 244 файлов совпали с исходниками. Runtime относительно предыдущего превью отличается только core/packs.js; companion неизменен.

## Остаётся

Полное authored построение/парсинг HTML и длительная подготовка motion; нужен переход к независимо обновляемым регионам с явной инвалидацией. Это исправление не выполняет само по себе требование точечного рендера и не закрывает всю матрицу игр/устройств/сетей/доступности/usability.

Evidence: [pack-activation-1104](../../../tmp_files/ux-021/pack-activation-1104/), red.log, green.log, view-contract.log, clean-result.json, clean-cpu-profile.json, clean-trace.json, source-state.json. Внешние игровые сервисы заблокированы fixture router.

## Публикация проверенного кандидата

Существующие временные Funnel routes443/8443/standalone переключены на final этой итерации. Статусы до/после сохранены. Stable Pages/R2 не изменялись. Перед переключением сверены все230runtime-файлов: дрейфа относительно сборки нет; companion прежний.

Четыре публичные загрузки побайтно совпали с кандидатом:443/index,8443/index,sw.js,полный standalone HTML через проверенные64KiB ranges. Live Chromium: worker activated, cache/buildIdentity `playroom-pwa-v0.21.0-preview.1-67c23a167730e3f0`,15игр,downloadProtocol1,errors0,nativeSupabaseRequests0,changedDuringRun[]. Portrait390×844/landscape844×390 без overflow.

Встроенные паки доступны; staticFunnel по-прежнему возвращает404 на `/api/packs/catalog`. Это известное ограничение превью, не проверка удалённого каталога/сетевой игры.

Адрес: https://seth.tail6aebd4.ts.net/ ; также8443 и /hod-021.html. Evidence: funnel-before/after.txt, public-check.json, live-pwa/chromium-report.json и снимки. Полная матрица0.21 и точечный renderer остаются открытыми.
