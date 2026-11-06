# A31/A33 — читатель правил и обновление: реализация и адресная проверка

02.11.2026. Это ограниченное evidence двух поверхностей, не приёмка всей цели 0.21.
Независимая визуальная приёмка запрошена у design_critic; его результат фиксируется отдельно.

## Источник и подтверждённые расхождения

Основа: `GOAL.md`, `PROTOTYPE-FIDELITY.md`, неизменённый экспорт
`tmp_files/ux-021/connected-prototype/owner-decisions-7.json`, варианты help0/update0
из настоящего `prototype-v1.html`. Последнее уточнение владельца отменяет пошаговый
мастер кратких правил: нужен единый прокручиваемый материал. Цвета и настоящие
игровые тексты сохраняются. Reader и редактор настроек партии — разные задачи.

Свежие reference и before находятся в
`tmp_files/ux-021/reader-update-audit/reference-{help,update}-{390,844}.png` и
`before-reader/update-{390,844}.png`. Выбранный DOM прототипа снят без внешней
демонстрационной рамки/toolbar/statusbar, внутренние блоки не заменялись.
Аудит подтвердил правильный полноэкранный reader и уже работающий sticky TOC,
но перегруженную тремя shortcut-кнопками шапку, отдельные rounded tabs и отсутствие
форматирования краткого legacy-текста. В update была placeholder-сводка, а sync
выбирал первую `.updates-modal` во всём документе, включая suspended parent.

## Изменение

- `app/rulebook-view.js`: шапка Back/Правила/(?), локальная справка о режимах;
  безопасное форматирование абзацев, маркированных/нумерованных списков,
  strong/emphasis/code без выполнения HTML; клавиатура вкладок; обработчики
  ограничены собственным активным reader. Полные правила и sticky dropdown
  оглавления сохраняются, anchors ищутся внутри этого reader.
- Только `gameRulesMarkup` в `app/lobby-view.js`: краткий текст одним скроллом,
  общий `app-page-tabs shared-page-tabs`, selected/pressed/tabindex и page-index;
  полный структурированный текст, выбранные настройки и иллюстрации сохранены.
- Только reader-блок `app/mobile-surfaces.css`: отступы общей полосы вкладок,
  разделитель шапки и локальная типографика code/переносов.
- `app/update-dialog.js`: сводка из настоящего последнего подходящего release,
  экранированные details; sync только активной owner-поверхности, восстановление
  актуального progress при Back, уникальные IDs справки. Неопределённая загрузка
  не получает процент; измеренный объём/файлы и готовность используют реальные
  значения поступившего download-state. Existing PWA operations сохранены.

Другие dirty изменения в этих же файлах существовали до этого прохода и сохранялись.
Модели, packs/schema, production и отправка Push/объявлений не изменялись.

## Проверки

App HEAD при проверке: `c0722bc6655abf51c40419396c7367cd5d19da1f`,
companion HEAD: `901153a71cc3d7dee991fc2aaf810c914084e007`.
Это рабочий dirty tree, SHA не означают чистый snapshot. Адресные runtime-хэши:

| Файл | SHA256 |
|---|---|
| app/rulebook-view.js | 612d902244a894e68d5746d08abd355b4ffb5cda50b33bc3efcf76aecedbe1e9 |
| app/update-dialog.js | c6b5b8be19a39321ed2d1bd8ad62041fb9eca3b8a75aa466c9ddd0e921ba2e12 |
| app/lobby-view.js | f750ba4c0d716332287cd1b7fce0c0ed4ab9dd2c202a05368b23e24ee494b017 |
| app/mobile-surfaces.css | db825a3192a9f254fc1d1b056113d749cc611076724fcd8350228d0c05de1cda |

Сначала `--list`, затем из app repo:

```sh
node scripts/codex/test.cjs case/rulebook-view
node scripts/codex/test.cjs case/rule-settings-browser --name '0.21 reader'
node scripts/codex/test.cjs case/pack-update-notice-browser --name '0.21 update presenter'
node scripts/codex/test.cjs case/pwa --name 'PWA update isolates a waiting build, drops old caches and starts offline with saved data'
```

Результаты: unit 3/3; reader Chrome 1/1 и WebKit 1/1; update presenter Chrome 1/1
и WebKit 1/1; реальные local PWA operations Chrome 2/2 (обычный вариант и без
controllerchange). Для WebKit использованы `LAB_ENGINE=webkit`,
`PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit`,
`LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu`.
Общие Chrome tabs CSS были доступны до этих успешных browser runs.

Reader case проходит настоящие карточка→reader→Back и лобби→reader→Back,
вкладки/keyboard, sticky TOC 390×844/844×390, переход к параметрам, DOM/scroll
сохранённого parent и игнорирование synthetic click на suspended reader.
Update presenter проверяет release-text/details, available/preparing/unknown/
measured/paused/ready, aria/error, отсутствие выдуманного процента, контекст
ввода child и восстановление suspended owner. Его download-states — явные
fixtures представления, не доказательство скачивания.

Реальный existing PWA case отдельно проверяет waiting worker, фактическую
загрузку локальных ресурсов, interruption/offline, сохранение частичных файлов,
resume без повторного скачивания проверенных байтов, блокировку Apply активной
комнатой/вторым окном, успешный Apply с одним reload, offline boot и сохранение
localStorage/IndexedDB. Это не подмена UI. Нативные Supabase requests = 0 во всех
сохранённых отчётах; safe installFetch поставлен до goto. Физический телефон,
установленная PWA на iPhone/Android и рестарт внешнего приложения не проверялись.

## Артефакты и границы

В `tmp_files/ux-021/reader-update-audit/`:

- `reader-{brief,full}-{390,844}-{chromium,webkit}.png`, `reader-*-report.json`;
- `update-{available,preparing,unknown,measured,paused,ready}-{390,844}-{chromium,webkit}.png`,
  `update-presenter-*-report.json`;
- `update-operations/`: реальные download/failure/resume/ready скриншоты,
  `resume-request-counts.json`, `cached-index-check.json`, `button-states.json`,
  `operation-report.json`.

Отдельно сообщён root выходящий за lease вопрос: reader-вход «Как играть»
пока есть в шапке редактора правил (`app.js`); позднее указание владельца
перечисляет только карточку/лобби/партию. Этот проход его не удалял.

Первый reader run упал на слишком строгом тестовом допуске sticky относительно
наружной рамки body: штатный padding даёт 4–8 px. Исправлен только допуск измерения,
последующие Chrome и WebKit runs прошли. Не считать исходный failure зелёным.

Последний точечный повтор presenter Chrome/WebKit 1/1 + 1/1 выполнен после
исправления template-строки unique popover ID и включает реальное открытие (?)
и Escape. PWA 2/2 предшествует этой единственной правке атрибута справки;
код download/resume/apply не менялся, этот результат повторно не запускался.
