# 0.18.0-rc.5 — офлайн entrypoints

Приложение 0.18.0-rc.5 использует проверенную коллекцию 0.7.0-rc.4 и изолированный каталог 0.18-rc.4. Все согласованные изменения и ассеты — [RC4](RC-0.18.0-rc.4.md). Production 0.17.6 / 0.6.5 не переключается.

## Причина отдельного кандидата

RC4 GitHub prerelease и каталог паков опубликованы с проверенными SHA. Pages preview `e5f9fa7f-dfba-4a23-9c39-c676ac091217` был загружен workflow [38925410305](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38925410305), но обязательный offline smoke не прошёл. Online-защита, runtime bytes и 12 pack hashes прошли до этого этапа. Публикацию RC4 в preview нельзя считать принятой; старые файлы не переписываются.

Локальное воспроизведение на точном PWA обнаружило TypeError при первом вводе имени: PlayroomAvatarPicker отсутствовал после offline reload. Builder уже включал новые entrypoints в ZIP и INTEGRITY, но CORE service worker оставался отдельным ручным списком. Проблема относилась ко всем будущим новым HTML entrypoints, а не только аватарам.

## Исправление

- Builder объединяет вспомогательные CORE URLs с **всеми** JS/CSS entrypoints HTML, после content-addressed переименования. Дубликаты удаляются, порядок детерминирован.
- Версия cache задаётся builder из package.json: больше нет ручного расхождения rc.1/rc.5.
- Исходный SW также содержит текущие модули аватаров для локального запуска без упаковки.
- Существующий PWA test проверяет включение entrypoints именно в CORE, а не лишь наличие строки где-либо в worker.
- Браузерная регрессия строит remote-catalog PWA, устанавливает worker, отключает сеть, перезагружает, открывает все 48 пресетов и сохраняет выбор с именем. Page errors должны отсутствовать.

Проверки: только `case/pwa` для изменения builder/SW, затем обязательные сборка/SHA256/CRC, скачанные Release assets и защищённый preview smoke. Согласованные UI/правила RC4 не меняются, повторный полный набор не запускается. Пакеты/ассеты RC4 повторно не выпускаются.

Итоговый адрес и точные доказательства — [HANDOFF](HANDOFF-0.18.md).

`node scripts/codex/test.cjs case/pwa` — **18/18**, без fail/cancel/skip. Включены protected TLS bridge, update/install integrity, content-addressed CORE и настоящий offline выбор 48 аватаров.

## Подтверждённая публикация

[Preview](https://cc0f5728.playroom-hod-test.pages.dev), deployment `cc0f5728-375f-4e3a-94ef-3333571c9f68`. Runtime commit `0360c2eaee540d1476a09950b79dbca23cbfaa57`, packs commit `44117ebd3bc6019f6649548d57d7458034f814d3`. GitHub Release assets скачаны: 6/6 app SHA256 verified; 18/18 packs SHA256 verified ранее, архивы CRC passed.

Одна загрузка RC5 [38929397250](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38929397250) создала deployment, но smoke прервался на чтении runtime asset. Отдельный read-only preflight с exact release/preview ID [38931148300](https://github.com/GraphGiraffe/boardgame-playroom/actions/runs/38931148300) полностью прошёл: `preview-verified`, `uploaded=false`, `productionUnchanged=true`; защита, runtime bytes, 12 hashes, app RC5 / collection RC4, offline. Потребовалось обновление tooling, а не перепаковка runtime или повторный upload. PWA tooling regression — 19/19. Production app 0.17.6 / packs 0.6.5 и canonical deployment не переключались.
