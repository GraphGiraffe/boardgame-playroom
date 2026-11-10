# Durable local start and UI failure regression

Persist the prior session/archive and activate the next save successfully BEFORE replacing the current in-memory session/ID. On quota, denied storage or serialization failure, preserve exact prior bytes and identity; retry must not target a never-created ID and claim LIBRARY_REMOVED. Reuse an identical archive without another write. Never free quota by silently deleting sessions or temporarily removing the active save. Multiple localStorage writes are not a transaction: test failure at each boundary, not only successful save.

Use the common localized save-error path for quota/security/missing-save/generic errors. No raw DOMException toasts, private save payload logging or invalid assignment to a translation call. Distinguish actual quota from unavailable storage; HTML/pack size alone does not diagnose either. Measure saved state/history and browser storage separately. Prove old bytes survive, lobby remains usable, and retry succeeds after capacity/access returns. Existing focused cases are selected from the current runner (storage failures and player-profile/local start), not a remembered case count.

Share scene/input/feedback primitives across games, without game-ID switches in generic components. Failed/cancelled drag restores source appearance; immediate drag previews the whole legal run. Hints identify only exposed actionable cards and useful progress; stock hints highlight stock alone. Animation must preserve existing waste/stock cards, animate history and show a win dialog with final score after the final transition. Local play must not show host/network-only notices.

Use the shared tooltip behavior: long press reveals; release inside activates once and hides; move/release outside cancels activation and retains help for two seconds. Invalid targets flash red within the scroll clipping area; reserve enough inset for the entire highlight. Test actual touch and small/short viewports, not CSS presence alone. Avoid redundant delays; distinguish movement duration, reveal dwell and bot decision delay.

Themes in hub configure app theme/avatar style only. In-game settings show active pack families with >1 available variant; hide empty skin block. Samples use actual runtime components and matching IDs, not independent lookalike drawings. Cancel rolls back preview; Принять to its right persists, closes, refreshes geometry immediately. UI-only preference changes do not alter rules, IDs or hidden projections.

For artifact acceptance open the actual offline file:// HTML, not merely the dev server. Check missing resources/console errors, 320/390 portrait and short landscape, save/restore and selected skin/mode. SHA/ZIP integrity is separate from runtime behavior. Record exact roots, dirty state and commands; never reuse stale installed-packs or call a build a release. Run only risk-selected existing cases; documentation/plugin changes need their own tool checks, not an implicit app-wide gate.

# Runtime assets: ownership, packaging and review

Audit the prepared `*.playroom-pack.json` or final standalone HTML, not a recursive sum of repository files. Source masters, archived concepts and runtime resources have different owners. Report exact input paths/SHA256, actual UTF-8 file bytes, serialized pack bytes and decoded data-URL bytes separately. Compression estimates are not measured ZIP sizes. Large HTML does not establish a localStorage quota cause.

Use `python3 -m playroom_utils audit-assets /absolute/artifact.html /absolute/game.playroom-pack.json --report-dir /absolute/new-report` from the utility checkout; no config, compiler imports, builds or network. `--strict` exits 1 for candidates inside a pack; review them before removal. Plugin MCP `audit_assets` returns the same report read-only; CLI `audit-assets --artifact PATH` can repeat that flag. The report identifies exact files, embedded JS/CSS copies, resources repeated in different files, authoring files and HTML data-URL repetition. It does not prove arbitrary code reachability or detect every encoded/dynamic resource. Cross-pack copies are allowed because packs install independently; HTML app/pack duplication is a review candidate, not an automatic deletion.

Canonical compiler: packs `shared/pack_compiler.py`; host copy and compiler digest are generated/pinned companions. Source modules become rules/view/locales entrypoints and must not also ship as consumed files. Asset-pack scripts/styles already incorporated into entrypoints must not be shipped a second time. A WAV has one runtime resource, referenced through `PlayroomPack.asset`; do not embed another base64 copy in sounds.js. Preserve actual audio data/cue behavior when reducing packaging size. A source manifest may retain authoring dependencies for standalone asset-pack publication.

Current character runtime has two sets: `minimal` (Стандартный, first/default) and `simple` (Простой). Detailed masters stay archived in source, outside app and Pexeso runtime closure. Do not renumber the 48 semantic IDs. Unsupported saved visual styles fall back to minimal without rewriting sessions or deleting saves. Shared artwork in independent packs is intentional; host avatar catalogs are not a pack dependency. Pexeso skin families follow the selected game mode, not every possible deck.

Skins own overlap/exclusion geometry for horizontal/vertical/fan stacking. Apply layout on skin acceptance immediately and reserve maximum visible waste height even when empty. Inspect before/after draw, undo, cancelled drag, history, replay, rotation and skin change; appearance changes must not require a game action. Foundation placeholders use selected skin suit glyphs. Shared card tables use green light/dark palettes, card-shaped rounded slots and beige faces; use shared components rather than per-game copies.

Preserve original art, rejected candidates and chosen versions in source design archives. Compare poses, proportions, faces/accessories and four-finger hands against the original at full size AND actual avatar/card sizes. Standard characters retain the whole-art white silhouette outline, not individual-part outlines. Pack covers/cards share typography and suit geometry. Never replace archived masters with optimized runtime exports.

### Disappearing hands

Within the same game/viewer/viewport, removing or emptying a local or opponent hand must preserve its measured layout zone, including during public playback. Retain only geometry: never retain removed cards, private markup, commands or focus targets. Reserve resets with a new scene identity or viewport/scale change; explicit field reflow does not erase hand reserves. Check removal, repeated empty rendering and restoration in portrait and landscape.

## 0.19 presentation performance

Сопоставление публичных команд с разрешёнными действиями не должно выполнять попарную сериализацию N×N. Authority индексирует разрешённые значения по набору ключей команды в рамках одного снимка; дополнительные presentation-поля сохраняют прежнюю семантику сопоставления. Постоянного кеша игровых состояний нет. Локальный замер расстановки Морского боя (602 команды, seed 17): до ~203 мс, после прогрева ~21–23 мс; это время snapshot, не полный render и не замер телефона.

Не клонировать все руки/поле ради одного эффекта: выбирать source hands, leaving board refs и затронутые flip slots. Проверять порядок async prepare → ответ/звук → transfer → set/reveal → counters в local/network/history. При resize инвалидировать координатные резервы, сохраняя объявленные зоны пустых рук. Быстрый режим сохраняет видимость действия, instant при наложении выбирает ответ.

## Справка и компактная компоновка · 0.19.2

Общий заголовок стола занимает максимум две строки: если название переносится, подпись режима скрывается; после поворота экрана повторно измерять текст. `template[data-card-help-intro]` задаёт вводный блок справки активного пака. `--square-hand-padding` позволяет уменьшить резерв квадратной руки; значение по умолчанию сохраняет другие паки. Проверять полный offline HTML, восемь игроков и возврат portrait → landscape → portrait. Размер кнопки сверять по computed style: общий `--ui-target` может перекрыть локальные width/height.


## Обновление PWA и соседние приложения одного origin

`clients.matchAll({includeUncontrolled:true})` включает окна других приложений того же origin, включая установленные PWA. Перед уведомлением о готовности обновления и проверкой безопасности фильтровать окна по origin и пути каталога Service Worker. Сохранять завершающий `/`: `/playroom-hod-test-other/` не принадлежит `/playroom-hod-test/`. Публичная и зашифрованная сборки используют один механизм из `sw.js`.

Проверять подтверждения только окон, которые остаются открытыми после проверки; новое окно ХОД или неответившее окно ХОД по-прежнему блокирует активацию. Не обходить проверку действующей партии, не удалять данные ради обновления. Регрессии: `case/pwa --name 'PWA update checks only'` и `case/pwa --name 'PWA update isolates'`. Браузерный сценарий использует два окна ХОД и соседнее приложение, проверяет блокировку занятой партией, повторное обновление, офлайн-запуск и сохранность данных.

## Ввод из меню партии и дочерних экранов

Выходящая поверхность становится inert до завершения анимации. Действие,
открывающее следующий компонент, передавать владельцу явно после закрытия
меню; не ждать делегированного click от уже выбывшего узла. Проверять обычную
и сниженную анимацию, повторное открытие чата и сохранность черновика.

Игровой перехватчик не поглощает команды читателя правил: вкладки и оглавление
получает RulebookView. Проверять читатель из живой сетевой партии, включая
клавиатуру и возврат к тому же родительскому меню; каталоговый сценарий не
заменяет этот путь.

При восстановлении живого окна не считать сохранённый публичный план новой
анимацией: проверять конечный индекс сразу после возврата с главного экрана
и после reload локального сохранения, без старых фазовых звуков. Отдельно
подтверждать, что новые раунды всё ещё проигрываются; не выключать проигрыватель
для всей восстановленной сессии.

## Рука в фазах без карт · preview.49

Резерв должен существовать в авторской сцене с первого монтирования, а не зависеть от ранее измеренного DOM. В Mage Brawl возрождение и добыча используют inert геометрию панели управления и квадратной карты, без приватных карт/команд. Резерв остаётся внутри layout-self; fit поля учитывает его до закрепления tracks. Генерируемые action height/min/max-height освобождаются, если patcher изменил роль узла на hand. Регрессия `case/mage-brawl-browser --name "Mage respawn remount"` проверяет восемь игроков, fresh mount, portrait/landscape/return, исчезающую контекстную строку и добычу.
