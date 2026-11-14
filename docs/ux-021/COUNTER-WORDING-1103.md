# Общий счётчик действий: правильная форма слова

На offline-снимке предыдущей проверки PWA отображалось «Ход2 · 1 действий». Причина — отдельное число и неизменяемое слово «действий» в общей карточке, списке сохранений и сетевых архивах.

Добавлен один `ui.app.action-count` в canonical locales/ru/ui-app.json: «1 действие», «2 действия», «5 действий», с one/few/many/other. Используется существующий Translator с кешированными Intl.PluralRules/NumberFormat, а не новые ручные правила на каждом экране. На него переведены resumeCard, savedGamesMarkup, список сетевых архивов и просмотр проверенного архива. Источники чисел (move/revision/длина истории) и правила подсчёта не менялись. Три заменённых старых фрагмента удалены; в230runtime-файлах ссылок на них не осталось.

Сетевой диагностический текст сохранил отдельный переводимый разделитель участников. Generated core/messages.js получен через build.generate_messages из canonical JSON, не исправлялся вручную. Паковые правила, backend, сохранения и worker не изменялись.

## Проверки

- Existing localization `Russian plural categories...` и game-screen `Continuation cards share...`: RED наблюдавшейся формы/отсутствовавшего общего ключа → **2/2PASS**. Значения0,1,2,5,11,14,21,22,25,101,111 проверяют teens/составные числа; consumer-тест проходит через настоящий resumeCard и generated runtime catalog.
- Existing browser `saved records use labelled primary actions, preserve rare actions and readonly history across two local contexts`: **Chromium1/1 и WebKit1/1PASS**. Среди прежних paused-записей теперь есть реальная checkers-партия после одного законного действия; проверяется «1 действие» в обоих контекстах. Прежняя проверка компоновки, действий, Back и readonly-истории сохранена. Это frontend fixture с перехваченными backend-запросами, не реальный облачный аккаунт.
- Точный assembled HTML: **70состояний/движок** с обычной анимацией, errors/native Supabase/changedDuringRun0. Общие экраны, Data/библиотека/оформление/обновление/аккаунт, правила/лобби/игровые возвраты.

Команды selected unit/browser и логи: tmp_files/ux-021/counter-wording/{red.log,green.log,chromium-one-action.log,webkit-one-action.log,one-action-browser,artifact}. Проверки не объявляются полной проверкой всех счётчиков/механик или физических устройств.

## Кандидат и границы

`counter-wording/final`, app0.21.0-preview.1/collection0.8.9-preview.3,15игр. Standalone SHA256 `ea02abc81a8c3c3a5e171ae012f49887fb9532605de4325c268269c05422ae7a`; cache`83d9a4d71587371e`. Build exit0,8SHA/3ZIP CRC.230runtime-файлов,2canonical locale JSON, manifest и worker совпали с source ZIP. Четыре runtime-изменения перечислены в source-state.json; source worker не менялся. PWA227файлов/6083576байт (+139байт), уменьшение общего размера не заявляется.

Прежний operational PWA-upgrade1/1 и protocol unit относятся к неизменённому worker/client-коду и своей паре артефактов; ради текстовой правки не объявляются повторно пройденными. Публикация текущего кандидата проверяется отдельными public/live отчётами, а не подразумевается build. Общие A01–A36, physical/AT/внешние сети/Push доставка и независимая usability остаются открытыми. Production SQL, штатный релиз и объявления не выполнялись.


Публикация подтверждена отдельно: root443/root8443/SW и полный standalone SHA совпали с build; большой файл проверен12HTTP206частями без повторных полных скачиваний, временные части удалены. Отдельный live Chromium по обычному URL подтвердил activated worker,15игр,PushManager и metadata buildIdentity`83d9a4d71587371e`. Ошибок/native Supabase requests0. IPv4 bytechecks и свежий браузерный контекст не доказывают все внешние сети или физический upgrade.

Отчёт добавлен к ux-021-full-audit, revision362/readback, статусwork; исторические комментарии не удалялись. Документация могла обновиться после source ZIP, равенство230runtime/2locale и worker проверено отдельно.
