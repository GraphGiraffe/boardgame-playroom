# Durable local start and UI failure regression

Область применения: приложение **0.21.0** и коллекция **0.8.10**, engineApi 4 / viewApi 3 / protocol 3. Исторические этапы ниже поясняют совместимость; текущая приёмка хранится в [utils](https://github.com/GraphGiraffe/boardgame-playroom-utils/blob/main/docs/project/app/reports/ACCEPTANCE-0.21.0.md).

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

## Панели: системный жест скрытия и чтение

`PlayroomGameScreen.bindPanelGesture` — единый контроллер всех закрываемых typed-панелей, меню партии и чата; навигацией владеет переданный callback Back. CSS `--surface-dismiss-edge:bottom|right|left` определяет направление: вниз у нижней панели, наружу к соответствующему краю у боковой. Направление читается при начале жеста, смена placement/ориентации отменяет незавершённое вытягивание. Для чата и меню в landscape задан `right`, в portrait — `bottom`.

При вертикальном чтении остаются нативные scroll и инерция. Нижняя панель принимает направленный вниз pull только от верхней границы; если браузер уже забрал native pan, следующий pull начинают от верхушки без ручной эмуляции прокрутки. Боковая принимает горизонтальный pull наружу, сохраняя вертикальное чтение на любой позиции. Короткий жест и отмена возвращают панель; pinch/выделение/активный ввод не закрывают её. Размер чата продолжает менять его прежний resize control, исключённый из dismiss-жеста вместе с slider/separator.

Крупная кнопка-иллюстрация или строка действия может явно задать `data-surface-pull-through`: обычное нажатие сохраняет действие, соответствующий placement pull передаётся панели и поглощает завершающий click. Это opt-in кнопки, не разрешение перехватывать controls: вложенные ссылки, ввод, radio/range, редактор и горизонтальные scroller остаются защищены. Проверять реальный drag по illustration/caption/action row, а не только свободный текст. `tests/panel-pull-browser.test.cjs` проверяет native Chromium touch для bottom, marked preview и left/right; WebKit TouchEvent fixture — синтетическая проверка контроллера, не доказательство физического touchscreen. Native source-интеграция дополнительно проверяет настоящий чат/меню в portrait/landscape, чтение, resize, возврат draft и отсутствие action/Save при pull.


## Parameter measurement and WebKit

Keep layout writes outside ResizeObserver delivery: coalesce through one owned animation frame and guard width before scheduling. Dispose observers/frames with the editor. Bounded public-preview/summary measurement must preserve the same owned scrollport: temporary min-height changes can clamp WebKit scrollTop even when final geometry is identical. Anchor parameter help to the ordinary title container, not the fieldset anonymous content box. Regressions assert actual hit-tested help, no ResizeObserver page errors, unchanged card/next-row coordinates, scroll, control identity and focus.


## Parameter card headers (preview.69)

A native rendered legend can sit above the fieldset background even when the fieldset has display:flex. Keep its accessible name in a visually hidden, absolutely positioned legend; render the visible title and Help in an ordinary .rule-choice-heading inside the painted content. Do not repair this with negative offsets or a duplicate background. Header/Help rectangles must be within card padding on Chromium and WebKit, including wrapping titles. Prior tests checked title origin but missed the native background edge.

Compact option paint may be36px, but its radio label retains44px of native tap area. Preserve two-line labels, bottom alignment, Help44px, draft and stable card/scroll/focus across changes. Run the named painted-card header regression against the old exact artifact (red) and final artifact (green); do not infer physical-device acceptance from browser emulation.


## Preview.70 shared UI follow-up

Parameter captions anchor8px above their own options/counters; flexible space belongs to artwork. Measure public alternatives with intrinsic flex during reservation, restore original nodes/styles/scroll; key caches before generating SVG, dedupe summary strings before live measurements. Counter paint36px inside44px hit area matches options. Help uses the same proportional corner spacing as a library favorite, independently of its44px hit area.

A CSS entry animation may stay pending until the first rendering opportunity. Start fallback completion watchdog after owned animations.ready, not when DOM mounts; preparation longtasks must not consume motion duration. Keep reduced-motion/unmount/dispose cleanup. Overlay viewports clip X entry/exit projections while content scrollports retain their own measurable overflow. Test no-reduced-motion native entry, desktop classic scrollbars500/1366 and Back, not only static endpoints.

Physical card/deck/slot/die radii belong to scalable piece geometry, not general UI control radius tokens. Canonical SVG owns its print/rim clip; avoid a second fixed-pixel wrapper crop. See packs shared/view-kit.css and35component/size regression; preserve square/portrait aspect and full outer rim at miniature size.

Public parameter illustration IDs use the existing registered pack illustration callback, with no state, HTML or URLs from metadata. Generic1–4 IDs require parameter-illustrations-v1; every pack using these IDs declares it. Standard first-player, seat-order and ending illustrations are shared host semantics across games; packs use the canonical public endMode winner/round/last schema. Durak migrated its new-pack schema to endMode winner/last with stateVersion4; old v3 pack bytes remain pinned for saved games. Do not reintroduce a host alias for legacy field names. Fields carry the owning game context from the host, never a manifest-selected foreign game.

Public panel preparation owns bounded immutable markup prototypes and numeric geometry only. Schedule one pure factory per idle turn, never invoke show/open, authentication, network refresh, pack activation or a private projection speculatively. Drop hidden-page work; stale room/game/revision/actor guards reject late publication. Instantiate generated Help/tab/SVG IDs per opening, while fixed rulebook anchors remain scoped to their panel. Fresh permissions, room/actor attributes, draft and Back are never cached. Keys include exact manifest identity/version, actual translator locale and appearance generation; font completion/appearance invalidate, geometry also keys actual width/font/schema/count dependencies. Finish all choice writes before measuring envelopes. Cold first-mount layout remains synchronous; do not claim zero-latency preparation or physical-phone percentiles from desktop observations.

A dismissed unused hotseat lobby is not an active game. On an explicit update-all action only, retire its room-service state before update guards/pack cleanup, using a fresh lobby/non-recovery snapshot and discardRecovery participant/lease checks. Do not retire active/retained lobby surfaces, non-hotseat rooms, starting/playing/recovery, network ownership, failed storage or transitions. Never delete saves or relax the actual activation/cleanup guards; a room opened during download must still stop activation. Older already-loaded clients need one ordinary document reload to clear the stale in-memory setup.

## Геометрия ассетов в любом контексте

Нормализованный SVG/viewBox — единица физического масштаба. Материальные скругления, рамки, глубина, тени, внутренние отступы и печать задаются в его координатах. Полный типизированный SVG не получает вторую CSS-рамку/скругление/тень: это правило не зависит от scene и действует в параметрах, правилах, миниатюрах, галереях, руках, reveal и motion/request layers. Неподвижный слот тоже имеет собственный SVG материал; DOM сохраняет семантику и target/hit area. CSS-only рубашка домино и рамка шашечной доски используют нормализованные плоскости.

Размещение/допустимый размер принадлежат зоне. Собственные пропорции ассета сохраняются через meet, квадратная и портретная формы не подменяются общим ratio. Размеры текста интерфейса,44px touch targets и экранные контуры выбора/фокуса — отдельный слой доступности, не толщина материала. Не масштабировать их вслепую вместе с рисунком. При новом компоненте проверять все варианты общего каталога и реальные обёртки при24/48/96/144px, вне scene и в motion/reveal; не ограничиваться наличием процентов в CSS.

Parameter composite examples must be inert SVG or noninteractive wrappers; never place a real button inside the cycling preview button. Use the parameter-diagram marker for one bounded viewBox, actual game components for pieces, and currentColor with a transparent background for service symbols. Native acceptance includes all declared variants, two-line captions and stable card geometry.

Validate raw public parameter illustration callback strings for interactive tags before DOM parsing; invalid nested buttons may already have been reparented outside the card and evade a DOM-only assertion. Uniform parameter symbols use the standard UI icon family, including disabled/inactive states.

Player composites embed the complete canonical UI player SVG through vector.place. Do not redraw a torso, add clothing details, or normalize its stroke independently from its geometry. Review all parameter icons in context with two independent screenshot critics; SVG presence alone is not visual acceptance.

Surface input ownership is discarded on blur, pagehide/pageshow and visibility changes. Interrupted pointer streams must not leave a permanent multi-touch guard. Keep native reading, pinch zoom, input editing and outward side-panel gestures protected. Regression covers abandoned touch ownership followed by native touch dismissal, including the actual parameter-art surface.

SVG attribute filtering matches complete whitespace-delimited attribute names. Never strip width/height/x/y by suffix: stroke-width, opacity, data-family and data-entity must survive composition. Regression checks both raw output and actual nested glyph stroke in the browser.

A focused radio/checkbox is not an active text editor and must not block panel dismissal elsewhere. Panel touch may start on ordinary buttons, links and labels: preserve tap until outward movement is claimed. Only the scroll ancestors of the actual start target constrain reading-boundary dismissal; header/footer can dismiss regardless of the separate list scroll offset. Protect editing/range/selection at their own target, never globally because another element retains focus or selection. Footer Save swipes must dismiss without submitting the draft.

Parameter SVG centering changes the viewBox origin without zooming each variant to its bounds. Keep identical primitive scale and a stable envelope across all options; assert centered ink on both axes. Simple fleet/team heroes use natural height with a96px minimum; complex heroes may retain160px. The shared seating/draw table mirrors side chairs and arrow anchors. The last-round symbol is a small dial/sector/speed group, with no stopwatch controls.


## Реакции: устойчивая привязка при появлении · preview.96

Позиционирование picker и пузырей использует полный layout-размер (`offsetWidth/offsetHeight`), без анимационного `scale` из `getBoundingClientRect`. Иначе возле границы доступной высоты пересчёт каждый кадр меняет сторону над/под аватаром. Регрессия `case/lobby-layout-browser --name "reaction picker keeps"` открывает панель настоящим триггером после перемещения участника по четырём рядам, проверяет координаты каждого кадра, фокус и Escape в portrait/landscape/return с обычным и reduced motion. Точный offline HTML задаётся через `REACTION_ARTIFACT_HTML`.

Нулевой запас дополнительных жизней в Стихиях объявляет `symbol/close` на варианте параметра, как выключенные настройки других паков. Примеры сжатия — публичные `illustrations` пака: одинаковое исчезающее поле и разная причина. Подписи всех вариантов проверяются на две строки при 360/390px в обеих темах; `case/lobby-parameter-choices-browser --name "Mage shrink previews"`.

Счётчик сжатия — одно поле 4×4 при любом числе дополнительных жизней: четыре постоянные светлые центральные клетки и 12 внешних. За шаг закрашиваются 6/3/2 внешние клетки при 0/1/2 дополнительных жизнях. Предупреждение меняет прозрачность только внешних групп; никакого фона, filter/drop-shadow или мигания центра. В reduced motion край статично красный. Проверка `case/mage-brawl-browser --name "Mage team reserves and shrink indicator"` измеряет порядок всех клеток, все заполнения, обе фазы предупреждения, стабильность центра и отсутствие внешнего свечения. В настройках порядок кнопок: Тема → Во весь экран → Назад.

Команда Стихий передаётся через обычный `scene.players[].team`, как в Лудо; общая карточка рисует стандартный медальон без отдельной реализации. Предупреждение края и счётчика наследует один анимируемый `--mage-warning-opacity` от общего `.mage-scene`, включая поздно добавленные/заменённые узлы. Индивидуальные анимации не запускать. Проверять совпадение фаз в минимуме, максимуме, середине и на живых кадрах, постоянный центр и static reduced motion.

Общий аватар резервирует `--player-medallion-overhang` перед именем, если присутствует медальон. Абсолютное позиционирование и резерв используют одну геометрию; не сдвигать текст отдельными игровыми CSS-правилами. Проверять зазор медальон→имя в портретной, компактной и горизонтальной карточках.

## Команды и результаты · preview.98

Системный порядок команд: blue, red, cyan, brown; цвета задаются ролями `team.*`. Лобби отображает стандартный командный медальон на каждом слоте, включая пустой, по `teamLayouts` выбранного режима. Общие компоненты не определяют команду по ID игры. `PlayroomRooms.sessionSetup` передаёт физические номера занятых мест отдельным `seatIndices` при создании сессии; метаданные игроков не содержат этих полей, account ID или resume-token. Это сохраняет команды при пустых промежуточных слотах и не нарушает восстановление метаданных.

Необязательный `result.playerOrder` — полная перестановка индексов игроков; он определяет порядок внутри одинакового места. `result.order` остаётся направлением метрики. Для прежних командных паков без перестановки используются типизированные метрики результата. Медаль места отображается отдельно, командный жетон или жетон первого игрока — стандартным медальоном в углу аватара. Параметры бота находятся под именем. Регрессии: `case/game-screen`, `case/model-contract`, `case/result-team-medallions-browser`.

Счётчики резервов Стихий показываются только в собственной карточке: по одному жетону × количество, в системном порядке, с пропуском отсутствовавших команд. При переносе status на дополнительную строку общий `player-info` растёт по содержимому, без игровых поправок высоты. `case/lobby-layout-browser --name "system teams mark"` проверяет 2/3/4 команды, пустые и разреженные слоты, одинаковый порядок резервов у разных зрителей и границы карточки в portrait/landscape/return. `case/mage-brawl-network-browser --name "Mage Brawl WebRTC:"` проверяет локальные host/client/Table и приватность планов; это не проверка внешней сети или Supabase.

Цвета первых четырёх игроков разрешаются общим `playerColor` через роли темы `side.green/red/blue/yellow`, с приоритетом явного `--color-seat-N`. Запасные значения совпадают с приглушённой палитрой стандартных тем. Арты режимов не заводят собственную палитру. `case/lobby-parameter-choices-browser --name "explicit mode previews"` проверяет обычные режимы Лудо и Стихий в обеих темах, живое изменение роли и приоритет цвета места.

## Командное планирование ботов Стихий · preview.101 / пак .40

Прогноз бота получает только его проекцию и собственную последовательность карт. Общий resolver применяет движения, урон, толчки и финальное сжатие без чужих планов, добора или RNG; недоступность возрождения без баз использует тот же помощник, что обычный раунд. Не копировать историю кадров в каждый прогноз. У команды есть штраф за урон союзнику, потерю участника и общего запаса; ошибка сложности не выбирает избегаемый friendly fire. В двухкарточном режиме перебор ограничен 4/8/12 начальными действиями, а второй выбор пересчитывается с учётом собственного первого хода. Одинаковые по эффекту физические карты не раздувают поиск; выбранный ID остаётся легальным.

`case/mage-brawl` проверяет точные эффекты, настройки ошибок, скрытые руки/планы, детерминизм и завершение партий на 2/3/4 команды. `case/mage-brawl-browser --name "Mage team bots submit"` использует настоящие кнопки карточек/действий/поворота/готовности в партии на восемь игроков; семь ботов заранее отправляют по две карты. Прогноз для выбора тестового ввода не заменяет реальные UI-коммиты. Локальный `case/mage-brawl-network-browser --name "Mage Brawl WebRTC:"` отдельно проверяет host/client/Table; это не доказательство физического телефона или внешней сети.
