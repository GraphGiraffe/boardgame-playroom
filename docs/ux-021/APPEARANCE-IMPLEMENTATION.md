# A28: галерея оформления и жизненный цикл выбора аватара

2026-11-02. Узкое source/browser evidence текущего рабочего дерева; не полная приёмка 0.21 и не проверка физических устройств.

## Композиция и границы

Основа — выбранный appearance=1, «Галерея образцов», `reference-appearance-390.png`/`844.png`: отдельный экран, Тема/Колода/Арты, настоящие образцы, закреплённые Отменить/Применить. Реальные immutable builtin темы — Светлая/Тёмная; демонстрационные Сад/Песок/Сумерки и отсутствующий в модели переключатель системной темы не добавлялись. Бежевый/чёрный и отрисовка компонентов сохранены.

Изменены `app/appearance-ui.js`, галерейный error style в `appearance.css`, `app/avatar-picker.js` и выбранные сценарии существующего `tests/appearance-browser.test.cjs`. Root отдельно интегрировал caller predicates в `app.js`. `appearance-web.js`, модели темы/скинов, pack skins, Scene/layout и каталог не менялись. `appearance.js` в дереве отсутствует.

## Владение поверхностями

- Галерея лениво создаёт собственный ModalController на общем `#modal-root`. Lazy обязателен: appearance-ui загружается раньше platform/web/dom. Первый top-level вариант был ошибочным, исправлен до финальных проходов.
- Один frame хранит theme/skin draft/tab/game. Обработчики вкладок, выбора игры, образцов и Apply работают только в собственном active frame. Пассивное document-wide обновление темы больше не перезаписывает выбранный черновик.
- Apply сохраняет через прежние порты моделей и закрывает только свой frame. Cancel/Back/Escape не сохраняют черновик. Родитель остаётся исходным connected/inert DOM; pop возвращает его фокус, выделение и scroll через общий registry. `closeModal(true)` и app.openModal/renderTable здесь не используются.
- Tabs имеют tablist/tab/tabpanel, выбранное состояние, roving tabindex, ArrowLeft/Right/Home/End. Динамические ссылки aria-controls/labelledby локальны frame.
- Внешний существующий skinSettings сохранён. Подтверждение сброса привязано к точной исходной поверхности/панели/pack; после await проверяется действующее владение. Поздний результат не пишет настройки и не закрывает чужое окно.
- Destroy освобождает свой frame и именованные click/change/keydown/appearance listeners; отсоединённые кнопки не управляют новым foreground.
- AvatarPicker теперь тоже использует общий registry и typed panel, без отдельного avatar-picker-root, собственного inert или ручного focus trap. Parent disposal/reset удаляет зависимый picker. Public open принимает optional isCurrent и возвращает capability {frame,close,dispose}; callback вызывается после scoped pop и повторной проверки caller. Root avatarContext фиксирует исходные form/frame/room/participant/network/profile/account identities, допускает штатный suspended parent.

## Выбранные проверки

```
PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_APPEARANCE_ENGINE=webkit PLAYROOM_CAPTURE_DIR=/home/ivan/Projects/PlayRoom/tmp_files/ux-021/appearance-021 node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery'
PLAYROOM_CAPTURE_DIR=/home/ivan/Projects/PlayRoom/tmp_files/ux-021/appearance-021 node scripts/codex/test.cjs case/appearance-browser --name 'appearance gallery'
```

Финал: WebKit **3/3 PASS**, Chromium **3/3 PASS**, pageerrors[], native Supabase requests0. Настоящий SW сохранён. Изолированная fixture закрывает штатной Back незапрошенное предложение обновления, если оно перекрывает action: во время параллельных правок исходного SW такой настоящий update один раз прервал старый gallery case. Это не выдаётся за исправление PWA.

Проверены:

- Реальные варианты card-face и группировка; draft до Apply, сохранение после Apply/reopen, Cancel без записи.
- Прежние settings DOM/range focus/scroll под галереей; реальный локальный SharedViews projection Yatzy/scene/snapshot сохраняются. Вход из Settings через AppearanceUI.show — controller integration, не проверка обнаруживаемости этой кнопки в Settings.
- Реальный дочерний confirm сохраняет gallery DOM, выбранные tab/game/skin. Программный stale Apply из suspended frame игнорируется.
- Header Back, Cancel и Apply возвращают точный parent; отменённый внешним reset skin-confirm не меняет storage/чужой draft/focus; destroy не закрывает следующий foreground.
- Actual Profile → local name/avatar editor → picker → выбор/Back/Escape сохраняет form, nickname draft и фокус исходной avatar button. До Save профиль в storage не меняется. Reset удаляет picker и source, отсоединённый выбор не вызывает callback. Изменение optional caller token инвалидирует picker без выбора.
- 360×740/390×844/844×390: галерея без горизонтального overflow, Apply не ниже viewport и ≥44px; 390/844 avatar frame и Close ≥44px. Использован reduced motion.

Артефакты: `tmp_files/ux-021/appearance-021/{chromium,webkit}-appearance-{theme,deck,arts}-{390,844}.png`, avatar390/844 и appearance-report.json. Arts на этих кадрах — честное состояние «только стандартное оформление» у Домино, не доказательство всех возможных skin families. Deck844 снят после выбора образца с реальным autoscroll, не первоначальное положение списка. Тёмная тема применяется в функциональном сценарии; начальные sample PNG сняты на светлой теме.

Ранний WebKit проход один раз дал недетализированный false для объединённого scene/full snapshot assertion. После замены assertion на диагностический deepEqual оба финальных прохода прошли; отдельная воспроизводимая причина того раннего результата не установлена. Это не заявляется исправленным дефектом приложения.

Полный appearance-browser файл с историческими toolbar/settings путями не запускался. Не проверялись реальные RTC/handoff, интернет/TURN, физическая iOS-клавиатура, все packs/skin families и глобальная визуальная fidelity.

## Финальное замечание по адаптивности аватаров

Дизайнер принял показанные состояния галереи, но выявил отдельный дефект avatar
panel: фиксированные шесть колонок растягивали клетки до≈122 px в landscape.
Ведущий заменил их общим auto-fill с минимумом52 px и ограничением самой клетки
64 px. Число колонок рассчитывается доступной шириной; арты/палитра не менялись.
В существующий caller case добавлена проверка реальных touch-cell размеров
44–64.5 px в390×844/844×390.

`case/appearance-browser --name 'appearance gallery callers'`: Chromium **1/1 PASS**;
тот же выбранный case WebKit **1/1 PASS** с рабочими env из команд выше.
Проверены прежние draft/focus/родитель/caller invalidation и новый размер клетки.
Свежие `appearance-021/{chromium,webkit}-avatar-{390,844}.png`; ведущий просмотрел
WebKit844. Это адресные повторы после нового CSS, не повтор всех gallery scenarios.
