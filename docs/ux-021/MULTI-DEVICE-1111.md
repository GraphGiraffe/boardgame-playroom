# UX-матрица устройств, 11 ноября 2026

База проверки — точный автономный HTML preview.66 SHA256417e09e3ebef163223eb57bfb20e74a8fb782c426b4f2dd72da148a7bb92a9b7 и companion collection.40. Исправление чатов собрано в preview.67; игровые правила, параметры и правила-книжки не менялись.

## Устройства и путь

Chromium touch: S23 representative360×640/780, Pixel7 stock412×839↔863×360, TabS9 reference800×1280↔1280×800; WebKit iPhone390×664↔750×342(для Yatzy stock iPhone14 landscape750×340). ПК1366×768: мышь и поддерживаемая клавиатура. Отдельные старые390×844/844×390 и768×1024/1024×768 описаны как custom, не переименованы в stockdevice. Это эмуляция, не физическая проверка Samsung/Pixel/iPhone/SafariOSkeyboard.

Новые профили создаются через welcome-форму, без прямого пропуска входного экрана. Параметры/правила15паков:120путей(240brief/fullview), native cycle/exact options/Help/Escape/Enter/Save/Cancel/возвратDOM-draft-scroll, desktop ArrowRight ещё2/2. Лично просмотрены montage15паков и детальные экраны параметров/правил. Нерастянутые мини-иллюстрации, короткие однострочные опции и прежние три группы сохранены; дефектов в этом scope не найдено.

Навигация/чаты:24базовыхpaths,3точных дополнительных геометрии,2WebKitpaths,2nativehubswipe/scroll. Игры/обучение/история:12короткихпутей Mage/Yatzy/UNO/Tic/Spider на tablet/desktop/Pixel/iPhone: первый доступный ход после бота, reader/help, scrub/play/pause/Back, затем ещё реальный ход. Не считается завершением полных партий всех15игр.

Keyboard settings/forms case1/1Chromium+1/1WebKit на точномHTML. Проверены tab semantics, modal boundaries, account validation/focus, modality, current draft preview, game selection. Устаревший test ожидал header-first вместо реальной доступной dismiss-handle и удалённое промежуточное меню/select; адаптирован к новому UI без runtime-правки и ослабления focus/interaction-инвариантов.

## Найденное и исправленное

Room и direct chat игнорировали аргумент bottom при render(true) после своего send: message существовал ниже viewport, composer уже очищен. Теперь bottom явно передаётся существующему Cache.restore. У initial show удалён прежний render(!resume), иначе новый bottom-флаг сбрасывал сохранённый anchor при reopen; Cache.initial уже владеет начальным выбором позиции.

Только app/room-chat-ui.js и app/chat-ui.js меняют runtime. Без замены/клонирования существующих message/control nodes. Regression обоих чатов: ownsend→visible bottom, incoming while reading older→same anchor, incoming pinnedbottom→follow, same editor/focus/draft/keyed DOM, reopen→same semantic row/offset. Chromium и WebKit, каждый6состояний(2чата×portrait/shortlandscape/desktop). До исправления room/direct отдельно FAIL; после — PASS. Финальная сборка имеет собственный exact-artifact повтор.

## Критерии и ограничения

Primary guidance: [web.dev interaction](https://web.dev/learn/design/interaction/), [responsive accessibility](https://web.dev/articles/accessible-responsive-design), [tap targets](https://web.dev/articles/accessible-tap-targets), [W3C modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) и [tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Проверяем видимые/достижимые действия, reflow, границы/возврат фокуса и ожидаемое действие. Web.dev рекомендует48px; проект сохраняет принятые44px для основных touch controls. Это не декларация полной accessibility-сертификации.

Cloud traffic изолирован fixture; native lobby chat opening проверен отдельно от source-port сообщений. Реальные Online/Nearby delivery, reconnect/max clients, physical safe areas/экранная клавиатура, VoiceOver/TalkBack и полный Tab-order всехпаков не заявлены. Они не блокировали выявление и проверку конкретных UI-дефектов. Исходные логи, PNG и failures самого harness сохранены в tmp_files/ux-matrix-1111; публикация/SHA/ZIP/provenance/readback отдельно. Stable/main/Supabase/R2production/Push не затрагиваются.
