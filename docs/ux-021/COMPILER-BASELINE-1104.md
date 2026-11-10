# Восстановлена проверка компилятора и Markdown-правил

4 ноября открытый gate из SNAPSHOT-COPIES-1104/DEFERRED-STOCK-1104 закрыт для текущего исходного состояния: **весь case/model-contract —21/21PASS, skipped0, exit0**. Приложение и превью be443f/cacheaa9980 не менялись.

## Причина и исправление

Тест Markdown-правил сравнивал весь текущий компилятор с `git show HEAD:shared/pack_compiler.py`. В worktree уже добавлено включение canonical vector-art перед зависимыми shared UI модулями, а в HEAD его ещё нет. Первое отличие было в view.js Battleship. Это различие не устанавливает дефект Markdown-конвертера.

Сравнение теперь использует независимо подготовленный companion приложения `installed-packs.js`. Тест сам его не генерирует; canonical runner запускает Node tests без prepare. Проверяются совпадение всего каталога и полное равенство каждого bundle (manifest и все files), а не только наличие файлов или версии. Затем прежние Markdown assertions проверяют безопасные blocks, отказы для HTML/опасных ссылок/внешних изображений/неподдержанного вложения, исключение авторского `.md`, установку/активацию пака и реальный RulebookView HTML.

Prepared companion сохранил SHA256 `2fee8a345cfe53b012770ef96d4a4cbf83b7d72b6636fc9a6927705c985e92d7`. Все15 паков сравниваются с этим уже подготовленным набором. Это проверка текущей authoring/runtime согласованности; неизменность всех исторических опубликованных версий остаётся отдельным release-контрактом.

## Окружение и результаты

После исправления baseline тест впервые дошёл до Markdown-конвертера и обнаружил отсутствующий mistune. Зависимость уже объявлена в packs/docs/AUTHORING.md; установлена только в локальный `tmp_files/toolchain/authoring-venv`: Python3.14.4, mistune3.4.0. Системные пакеты и настройки не менялись. Первая загрузка PyPI была запрещена сетевой allowlist sandbox; разрешённый запуск вне sandbox установил пакет. Журналы обеих попыток сохранены.

Команды выполнены через существующий canonical runner:

```sh
source /home/ivan/Projects/PlayRoom/tmp_files/toolchain/webkit.env
PATH=/home/ivan/Projects/PlayRoom/tmp_files/toolchain/authoring-venv/bin:$PATH \
  node /home/ivan/Projects/PlayRoom/playroom/scripts/codex/test.cjs \
  case/model-contract
```

Выбранный исходно падавший Markdown case:1/1PASS. Оригинальная полная выборка model-contract:21/21PASS. Прежние RED (HEAD-byte comparison и missing mistune) сохранены отдельно; они не названы успешными проверками.

Evidence: [compiler-baseline-1104](../../../tmp_files/ux-021/compiler-baseline-1104/): before/selected/full/setup logs, `executed.test.cjs`, `own-changes.patch`, `source-state.json`. Изменён только tests/model-contract.test.cjs; runtime230файлов и installed companion не изменились. Предыдущий source ZIP предшествует этой тестовой правке; новой сборки/публикации/SQL/Push нет.

Полная цель0.21 остаётся work: UI/game/physical/network/usability scope не расширяется результатом этого unit/authoring case. Остаточная задержка около100мс и полная authored-разметка не закрыты.
