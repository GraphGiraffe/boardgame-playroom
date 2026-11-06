# Краткие иллюстрированные правила 0.21

Кратко — самостоятельный обзор из трёх разделов: Цель / Ваш ход / Финиш. Локализованная схема `rulebook.brief` принадлежит каждому паку; общий Host SDK переводит её и передаёт в существующий renderer. На экране два реальных публичных рисунка, без команд и текущего состояния партии. Полные `rulebook.sections`, `metadata.rules` и все прежние значения локали сохранены. Параметры и оглавление остаются в полных правилах; старый пак без обзора получает явный переход к ним.

Словесный бюджет включает заголовки, абзацы и подписи; символы внутри изображений карт/фишек и подписи инертных игровых контролов не считаются редакционным текстом.

| Пак | Слов | Рисунки |
|---|---:|---|
| battleship | 87 | place, shoot |
| checkers | 91 | move, king |
| domino | 91 | join, controls |
| durak | 95 | defend, throw |
| gofish | 97 | request, quartet |
| klondike | 95 | column, stock |
| ludo | 89 | base, move |
| mage-brawl | 129 | type-control, order |
| oldmaid | 96 | pair, choose |
| pexeso | 91 | flip, pair |
| snakes | 93 | dice, links |
| spider | 97 | sequence, deal |
| tictactoe | 89 | place, line |
| uno | 99 | match, uno |
| yatzy | 95 | roll, score |

Версии всех 15 изменённых паков: preview.1 → preview.2 одним повышением; коллекция 0.8.9-preview.2. Каноническая сборка `python3 ../playroom-paks/build.py`, затем host-sync `python3 build.py --packs-dir ../playroom-paks/packs --prepare-dev --all-games`. Generated host/manifest copies вручную не менялись. Публикация не выполнялась.

Проверки: renderer3/3, view-contract11/11, targeted model integration1/1. Браузер: Chromium1/1 PASS для brief-содержимого и renderer (предыдущий точный HTML; scope переиспользован). Финальный affected WebKit1/1 PASS на `tmp_files/ux-021/review-02/playroom-all-games.html`: все15 обзоров в90 сочетаниях темы/размера, fallback, полный reader/Back; errors[], nativeSupabaseRequests0. Выявленный file-origin запрос каталога исправлен владельцем RemoteCatalog. Реальный Profile → Игры и обновления показывает объяснение недоступности каталога из файла, кнопка проверки выключена, native catalogue requests0; сетевой вызов не маскируется fixture.

Existing reader case сохраняет реальный card→rules→Back→lobby, вкладки/клавиатуру, закреплённое оглавление, точный DOM/scroll возврата из вложенного окна. Затем читает все15 обзоров из собранного автономного HTML: обе темы, 320×740,390×844,844×390; проверяет 3 раздела, слова, два реальных рисунка, инертность, отсутствие параметров в brief, геометрию всех рисунков, доступность full. Проверяется fallback старого пака. Safe fetch включён до goto, внешние provider-запросы не допускаются.

Артефакты: `tmp_files/ux-021/reader-update-audit/reader-{chromium,webkit}-report.json`, `brief-{game}-{theme}-{width}-{engine}.png`; исходная инвентаризация `tmp_files/ux-021/brief-source-inventory.json`. PNG — первый видимый фрагмент обзора; геометрия проверяется у обоих рисунков, включая находящиеся ниже. Физический телефон/голос/камера/NAT этим сценарием не проверяются.

## Финальный локальный кандидат

HTML SHA256: `c0e021047198ba8c4b113c5e1e647eb5279a444e4a7f2a9fde1aeccbdb419f53`. App0.21.0-preview.1, коллекция0.8.9-preview.2, 15паков preview.2. После сборки root повторён только affected WebKit reader, без новой сборки и runtime-правок.

```sh
LAB_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit PLAYROOM_OFFLINE_HTML=/home/ivan/Projects/PlayRoom/tmp_files/ux-021/review-02/playroom-all-games.html node scripts/codex/test.cjs case/rule-settings-browser --name '0.21 reader uses one scroll'
```
