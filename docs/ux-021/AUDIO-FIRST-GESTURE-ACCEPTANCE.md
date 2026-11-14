# Аудио: первый жест, запуск партии и сигналы интерфейса

Дата: 2026-11-03. Исходники заморожены в рамках аудио; общей сборки и публикации этот этап не выполняет.

## Причина и воспроизведение

В существующий `tests/network-feedback-browser.test.cjs` добавлен один адресный case `UI audio 0.21 first native touch plays the first committed cue without a second action`. Он загружает настоящее приложение и настоящий `AudioContext`, выполняет native touch по законному броску Ятзы. Proxy только наблюдает native constructor/resume/oscillator.start и делегирует настоящим API. Никаких autoplay overrides, поддельного контекста и настоящих сообщений/Push.

До исправления Chromium прошёл, WebKit принял первый ход, но не запустил ни одного oscillator: `resume()` ещё ожидал native запуск, а `audio.batch()` отвергал сигнал при `state=suspended`. В наблюдавшемся RED trace pointerdown был на2635ms, resume на2645ms, running на3062ms; старый сигнал уже потерялся. RED-log: `tmp_files/ux-021/audio-first-gesture/webkit-red.log` в workspace. Финальный trace лежит отдельно и соответствует исправленному коду.

Дополнительно constructor и resume были за первым microtask; startup UI play самостоятельно вызывал unlock. Это исправлено в общем аудиопорту.

## Изменение

- `core/audio.js`: context и resume запускаются синхронно внутри gesture; `prepare()` ждёт только уже начатый unlock, максимум1000ms, с abort/stop/generation guards. Не создаёт контекст и не откладывает входящий сигнал до будущего жеста. `busy` учитывает ожидание.
- `app/game-feedback.js`: используется существующий async group port PlanPlayer; готовность звука проверяется перед prepare-группой эффекта. Sound и motion остаются в своих одновременных группах. Текущая очередь принадлежит feedback и во время readiness; отменённый план не оживает.
- `app/app.js`, `app/shared-views.js`: общий prepare port для local/network presentation; pointerup дополняет pointerdown как gesture-end retry. Bridge UI play ждёт существующий unlock вместо самостоятельного startup unlock.
- `app/ui-feedback.js`: сохраняются12 разных cue сообщений, реакций, приглашений, друзей, передачи хоста, соединения, ошибок и обновления. Добавлен только `game.start`.
- `app/app.js`, `app/network-ui.js`: game.start после успешного durable свежего старта, со стабильным session ID. Не добавлен на произвольный mount/history/resume/reconnect. Network client hook ограничен живым lobby/starting→revision0 переходом; host recovery исключён.

## Проверено на final scope

Native case Chromium1/1, WebKit1/1: первый настоящий touch по броску; до gesture нет контекста даже при входящем UI cue; actual Klondike lobby→start даёт ровно3oscillator и duplicate того же session ID молчит; native keyboard master volume0/100 и UI switch сохраняются; muted notification не проигрывается после включения; настоящий update-ready listener даёт2oscillator и повторное событие молчит. Старый auxiliary test-button попал под нижнюю навигацию; fixture заменён прямым update-ready событием после уже полученного жеста, без force/таймаутных обходов. Это проверка listener, не доставки обновления сервером.

Адресные pure cases: engine standalone audio1/1 (synchronous constructor/resume, readiness, stop/abort/timeout, mute); game-feedback18/18 (включая audio readiness до visual/sound и отмену); semantic UI feedback1/1 (разные сигналы, volume/UI consent, busy, background, account dedup, game.start dedup). Syntax и scoped diff-check завершились0.

Финальные trace, логи, метрики и SHA: `tmp_files/ux-021/audio-first-gesture/{chromium,webkit}-trace.json`, `*-final.log`, `acceptance.json`, `source.sha256`. Native Supabase requests0, page errors[] в обоих браузерах. Общие app/shared-views/network-ui файлы параллельно имеют чужие разрешённые изменения; SHA фиксирует снимок проверки, не авторство всех их hunks.

## Границы

Native WebKit/Chromium показывают принятие жеста, running context и запуск настоящих WebAudio source, но не физическую слышимость динамика телефона. Silent switch, ОС, Bluetooth/выбранный выход и реальные background/autoplay ограничения остаются проверкой на устройствах. До жеста звук не форсируется. Зависший/запрещённый native resume не удерживает игру дольше ограниченного readiness. Прежние mute/visibility/master-volume правила сохранены; никакой постоянной звуковой подложки и сигналов на каждый render.
