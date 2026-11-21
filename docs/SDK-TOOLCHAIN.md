# SDK и работа с проектом в редакторе

Техническое решение: самостоятельная библиотека SDK, компилятор, CLI, типы, схемы и исполняемые примеры. VS Code или другой IDE владеет файлами и кодом. Локальный просмотрщик использует настоящий runtime и представление приложения; создание отдельной IDE не требуется. Восстановление совместимости с [механиками и видом 0.21](SDK-COMPATIBILITY.md) имеет приоритет перед расширением авторского интерфейса.

## Переиспользуемые инструменты

| Потребность | Решение и граница |
| --- | --- |
| Файлы, Git, поиск, код и подсветка | Обычный workspace редактора. Не дублировать проводник и редактор в студии. |
| Манифест, настройки, локализация | JSON Schema и локальные `json.schemas`, подсказки/описания/enum/defaults и примеры. Runtime-validator и компилятор остаются источником обязательной проверки; schema не исполняет пак. |
| JS/TS API | Контракты SDK и обычный TypeScript language service/`checkJs`, явная проверка типов. Не создавать собственный language server до измеренной необходимости. |
| Команды new/check/verify/privacy/compile | CLI, явные VS Code Tasks, распознаваемые диагностические координаты для Problems. Открытие проекта ничего не запускает. |
| Правила с вёрсткой | Файлы Markdown/структурированных блоков и готовый preview редактора для текста; итоговую вёрстку проверяет штатный RulebookView на runtime-компонентах и ассетах игры. |
| Изображения и звук | Студия показывает и воспроизводит объявленные ресурсы. CLI `convert-asset` готовит WebP или Ogg и сохраняет SHA исходника и результата. |
| Viewport телефона/планшета/ПК | DevTools Device Mode, размеры/поворот и настоящий viewport. Многоэкранное сравнение — независимые контексты либо iframe, а не сжатие div с неизменными CSS media queries. |
| Автоматизированное сравнение | Имеющиеся сценарии Playwright, точные состояния/seed, screenshots и геометрия. Не мигрировать весь тестовый runner только ради расширения VS Code. |
| Локальная партия, зрители, история | Тонкий просмотрщик SDK с теми же renderer/components, авторизованными проекциями и временной моделью, что у приложения. Диагностика доступна в среде разработки, а не обычной партии. |

VS Code уже поддерживает локальные JSON Schema, completion, validation и snippets; отдельное расширение ради форм манифеста не требуется. [Официальная документация JSON](https://code.visualstudio.com/docs/languages/json).

Tasks подключают внешние CLI, problem matchers связывают их вывод с файлами. Команды должны использовать массив аргументов, понятный cwd и явное действие пользователя, без shell-интерполяции исходников. [Официальная документация Tasks](https://code.visualstudio.com/docs/debugtest/tasks).

Для обычного просмотра loopback URL доступны [встроенный браузер VS Code](https://code.visualstudio.com/docs/debugtest/integrated-browser) и [Microsoft Live Preview](https://github.com/microsoft/vscode-livepreview). Live Preview не заменяет SDK-сервер с проверкой Host/Origin и изолированными guest-средами. Не устанавливать второй сервер и не расширять его доступ к workspace только ради запуска уже имеющегося просмотрщика. Наличие встроенного браузера в конкретной установленной версии IDE проверяется перед настройкой.

Эмуляция viewport/touch/DPR и конфигурации устройств доступны в [Playwright](https://playwright.dev/docs/emulation), его [расширение VS Code](https://playwright.dev/docs/getting-started-vscode) даёт привычный запуск и отладку тестов. Оно предназначено для Playwright Test; существующие `node:test` сценарии проекта запускаются штатными tasks, без обещания автоматической интеграции в чужой runner. [Chrome Device Mode](https://developer.chrome.com/docs/devtools/device-mode/) приближает отображение устройства, но не подменяет физическую приёмку.

Microsoft рекомендует использовать webview лишь при необходимости функциональности, которой нет в обычных API редактора. Поэтому самостоятельный VS Code plugin не является обязательным слоем SDK. [Webview UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/webviews).

При открытии сгенерированного `playroom.code-workspace` доступны явные задачи
`PlayRoom: Diagnose SDK` и `PlayRoom: Check contracts and assets`. Первая проверяет
готовность локального SDK и возвращает отчёт JSON. Вторая подключает ошибки
исходников к Problems и позволяет открыть файл на указанной строке. CLI остаётся
доступным из любого редактора.

Сгенерированный workspace подключает локальные схемы коллекции к
`manifest.json`, `settings.json` и `lang/*.json` через настройку `json.schemas`
в файле `playroom.code-workspace`. Подсказки и диагностика структуры работают
офлайн. Для проверки ссылок на локали, доступности игровых вариантов и отделения
данных разных игроков запускайте `check`, `verify` и `privacy`.

## Авторские данные и упаковка

Исходные domain/presentation, настройки, языковые каталоги, правила и ассеты остаются отдельными читаемыми файлами. Транспортный `.playroom-pack.json` собирается компилятором; его не редактируют как основной проект. Общие значения yes/no, числа, единицы и общие компоненты используют библиотеку SDK/приложения, собственные тексты пака — языковой каталог. Раздельная подготовка настроек не создаёт второго независимого runtime-манифеста: компилятор должен получить один согласованный `manifest.settings`.

Проекты коллекции и шаблон счётчика хранят настройки в `settings.json` с полями `fields` и `groups`. В исходном манифесте указан относительный путь `"settings": "settings.json"`. При сборке компилятор заменяет ссылку блоком настроек прямо на её месте. Студия и приложение передают значения игровых параметров в правила через `options.options`. Число игроков и пресет остаются параметрами запуска.

Подготовка манифеста/настроек/правил, подключение shared-компонентов и ассетов, doctor и экспорт должны быть вызовами одной библиотеки и CLI. Все мутации имеют явные входы/выходы, проверяют ID/путь/версию и не перезаписывают существующий проект/мастер/экспорт без отдельного намерения пользователя. Doctor объединяет имеющиеся validator, типы, dependency closure, правила приватности, размеры/форматы/provenance и проверку упаковки; он не запускает широкие игровые наборы и не исправляет файлы молча.

Разработка остаётся независимой от редактора: обычный JS/TS-проект и несколько реальных примеров должны полностью проверяться и упаковываться из терминала. `.code-workspace` добавляет удобство, но не является готовым SDK или доказательством совместимости.

## Изоляция и воспроизводимость

Пак не исполняется в extension host, Node host или DOM приложения. Редактор показывает исходники; SDK запускает правила, ботов и presentation в их ограниченных средах. Запрещённые обращения диагностируются и при случайной ошибке автора, включая координаты исходника и роль. Не предоставлять filesystem/network/credentials через удобный API предпросмотра.

Просмотрщик различает роль зрителя, игру, точную версию пака, seed/настройки, историю и состояние. Экспорт включает полный resource closure, лицензии/provenance, размеры UTF-8/decoded и SHA. Сравнение использует точный компилируемый артефакт; открытый исходник или один удачный preset не подтверждают работу всего пака.

Планирование этапов и статусы — в ROADMAPler, без второй локальной доски задач. Установка расширений, отправка telemetry, публикация и обновление plugins не входят в открытие SDK-проекта.


### Refresh an existing author workspace

Run the following from the PlayRoom workspace. The first command prints a diff.
Repeat it with `--apply` to refresh the SDK declarations and add missing tasks,
inputs and schema associations. Existing task labels and custom settings are preserved.

```sh
python3 boardgame-playroom-utils/sdk.py --app playroom refresh-editor PROJECT --packs playroom-paks
python3 boardgame-playroom-utils/sdk.py --app playroom privacy-suite PROJECT --shared playroom-paks/shared
```

The suite runs SDK privacy pairs in `sdk/privacy/*.json` and `sdk/privacy-*.json`.
Failed rows include the single-pair retry command. In an authored rules scenario,
a step can additionally assert the spectator projection with `expectPublic`
using the same path syntax as `expect`. This also checks which data must be visible.
