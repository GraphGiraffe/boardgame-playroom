# Ordered presentation execution (local refactor)

## Progressive public frames (preview.14)

Owned registry renders with a `regionSink` expose the optional local
`ui.publicFrames({key, plan, renderFrame, live})` port. `key` names a sequence
within the view; `renderFrame(index)` returns authorized `{markup, label,
players?, progress?, pack?, sound?}`. `live` has the same shape. There are at most
32 historical frames. Functions are renderer ports, never SceneModel/wire data.
Older hosts without the port retain the eager `GameComponents.publicFrames`
fallback. The host component also supports its source-shell descriptor.

The scoped registry cache owns generated records. Shell rendering builds no
historical field: PublicSequence materializes the displayed frame on demand,
without serializing every frame into a DOM bank. PublicSequence
prepares one following frame and parses its detached template in an idle task
during the current animation; at most two detached templates are retained.
Foreground playback uses that prepared frame, or builds one frame if idle work
has not run. Rebinding reuses completed records. Viewer, pack, surface, replay
and skin boundaries replace the source; cancellation invalidates pending work.
Deferred renderers retain the original asset/pack context. They must be pure
presentation of the already authorized scene, with no rules, DOM measurement,
dispatch or persistence. An idle error is delivered through foreground playback.

The application passes source ports alongside scene fragments directly to
GameScreen and its surface-local PublicSequence. An opaque DOM source name alone
cannot resolve a different surface's renderer. Public frame children remain
runtime-owned. Player panel heights are read together before any panel patch.

`GameScreenController.planningUpdate` recognizes readiness changes inside one
decision window: same audience/epoch/pack/control boundary, public plan and event
cursor, with no new effects/cues/reactions. Its coordination turn may change.
These updates use the latest snapshot without fetching each invisible history
revision and without motion capture. Explicit history remains complete; a new
window/event/plan or control boundary retains normal backfill and presentation.

NetworkSessionStore starts explicit IndexedDB `commit()` after queuing all writes
where supported. It still resolves only on transaction COMPLETE. Schema,
revision/transfer fences, atomic state+receipt persistence and failure handling
are unchanged. This removes an auto-commit event cycle, not durability.

## RAM planning and durable checkpoints (preview.15)

An active Session, installed rules and authorized view sources are held in memory.
IndexedDB is the durable backing store, not the source of live frames or local
selection state. Restore reads the session once. Normal turn commits read only the
stored header to enforce revision/transfer fencing; they do not reload history.

A portable definition may return a boolean from
`checkpoint(beforeData, nextData, actor, command)`. False means an editable,
private partial decision; it must not defer a public event or finished state.
The adapter forces a checkpoint for those boundaries. Existing portable packs
without this hook derive drafts from an unchanged simultaneous decisionWindow:
the actor stays unready and its decision version changes. All other transitions
keep the ordinary per-command checkpoint. No pack IDs enter this mechanism.

With a batch-capable persistence port, CommandProcessor keeps draft steps and
receipts in RAM and returns `draft:true`. This receipt acknowledges the live edit,
not crash persistence. Duplicate delivery reuses it without storage I/O. The
player's completed decision atomically commits its staged prefix, current step
and receipts in one transaction; that ACK still waits for transaction COMPLETE.
Failure retains the earlier RAM draft, rejects the final command and permits
retry. Explicit pause, controller change and host transfer flush pending drafts
before their durable control boundary. An abrupt process loss before a checkpoint
can discard only unconfirmed edits. Local solo/hotseat follows the same checkpoint
predicate for automatic saves; explicit save/exit may persist the current draft.

Network journals store structural state deltas plus newly emitted events. Startup
may restore old full rows and schedule compaction outside the command path,
yielding after each four historical states. The final transaction checks the
captured revision/transfer fence and preserves newer header metadata. Event
reconstruction uses the full journal, including bursts longer than a historical
state's short tail. Source pack versions and gameplay history remain unchanged.

PublicSequence compares its authored template baseline before patching the live
field, retains runtime-owned effects and prepares only small current player
panels on local redraws. An unchanged close of an ordinary modal does not emit a
settings-change event or redraw the field. A changed command-permission boundary
still renders. Geometry capture remains opt-in per affected action.

Evidence and measured limits: [planning performance](ux-021/PERFORMANCE-PLANNING-1106.md).

## Interaction transaction (preview.13)

The engine, transport and renderer share one transaction order. A local choice
(selection, rotation or slider) changes view state only. A committed action goes
through the current authorized command, SessionClient and authority once. The
authority validates once and durably commits completed decisions before publishing
their receipt; editable planning drafts use the RAM contract below. Animation
timing never delays or substitutes the durable checkpoint.

1. Capture the authorized initial geometry before changing the scene. Read the
   required geometry together, then update DOM. Reuse viewport measurements until
   resize/scale invalidates them; do not retain another viewer's markup.
2. Mark pending input with `GameScreen.interactionState`. It updates only the shell
   input marker and stage `aria-busy`; entering/leaving pending does not rebuild
   the field. All command handlers still check current rights, pending, history,
   pause and presentation state. Independent reactions use their own live rights.
3. Accept the authorized snapshot. `Protocol.immutable` detaches external JSON once
   and deeply freezes it; its private ownership registry permits in-process reuse
   of that value and its descendants. An externally frozen object is not trusted.
   WebRTC/MessagePort detach once at receipt; local authority snapshots are already
   owned. This is an allocation contract, not an authorization or schema check.
4. Queue each immutable snapshot object once in GameScreenController. A repeated
   ACK notification can release pending input without repainting. Different
   snapshots at the same game revision still carry pause/control/reaction changes
   and must be processed. History retains every committed revision.
5. Render the next authorized boundary and run its effects on the common player.
   Current live commands may be staged while input is gated, avoiding a second
   render solely to enable them. Old/history scenes never gain live commands.
   The public-frame display leases its children with `DOM.manageChildren`:
   PublicSequence owns those descendants, while the shell owns the frame bank.
   Passive shell patches cannot remove active effects. Bind and unchanged
   `setRate` are idempotent; advance only after all finite effects/audio finish.
6. On settlement, release input and send presentation/learning notifications.
   If the displayed and live snapshots are still the rendered objects, update
   metadata only. A changed selection or a new snapshot requires rendering.
   Destruction/cancellation guards prevent late promises from changing a new mount.

Portable GameModel remembers validation only for its own immutable positions.
Mutable, imported and otherwise untrusted positions are still detached and checked.
The engine preserves previous data when invoking a portable reducer, which returns
replacement data; legacy mutable reducers keep the defensive copy. Optional
mechanics absent from a definition return their neutral result before projection.
Roster metadata is projected once per render, rather than once per player card.

Focused evidence: `authority`, `model-contract`, `game-flow`, `game-screen`,
transport/reaction cases, Mage public-effect lifetime, and the named
`SDK interaction audit covers every installed pack and duplicate ACK delivery`
browser case. That matrix covers one initial action per installed pack; it does
not claim exhaustive gameplay or phone latency coverage.

`presentation/plan-player.js` owns the cursor and lifecycle of ordered groups.
It has no DOM, game-state, storage or command dependency. A group starts its
cues together; the next group waits for both its visible duration and all cue
promises. Rendering and audio are provided through ports, never rules commands.

A plan contains a nonempty `id` and `groups`. Each group has `duration` in
milliseconds (0–60000) and `cues`; each cue has a unique nonempty `id` and `kind`.
Adapters use numeric cue references into public render data held by ports.
Do not put functions, DOM nodes, private hands or unrevealed plans in descriptors.
The validator checks identity, timing, scene indices, semantic targets and recursively
serializable data. Functions, DOM nodes, cycles, nonfinite numbers and nonplain
objects are rejected. Scenes are viewer-authorized data; serializability alone does
not establish privacy. Targets use an EntityRef, participant index or zone ID.

```js
const player = executor.track('public-sequence');
player.play({id: 'round:12', groups: [
  {duration: 500, cues: [{id: 'move:2', kind: 'movement', index: 0},
                        {id: 'hit:4', kind: 'damage', index: 1}]},
  {duration: 200, cues: [{id: 'fall:4', kind: 'death', index: 2}]}
]}, {effect: cue => renderPublicCue(cue), final: showFinalProjection});
```

Calling `play` with the same plan ID updates ports and returns the same promise;
it does not replay effects, even after completion. Explicit replay after completion needs a new
ID. A cancelled run may be mounted again with the same ID. PublicSequence
advances its mount generation when its scene leaves the DOM. `pause` and `setRate` preserve remaining visible time. `skip` exposes the
final projection once; `cancel` calls the cancellation port without exposing a
final projection. Both release waiters even if a renderer never resolves.
Late promise completions cannot advance an obsolete run. Renderers that perform
asynchronous work must also respect the supplied `current()` context or their
adapter's generation token and cancel their own DOM effects.

`PresentationScheduler.track(name)` provides a stable player on a dedicated
lane. Root cancellation cancels all tracks and lanes. `GameFlow.cancelAction()`
cancels only enclosing action/motion work: normal action completion must not
cancel public round frames. `GameFlow.cancel()` is reserved for leaving or
interrupting the whole presentation context.

## Migrated consumers

- `PublicSequence`: public-frame DOM adapter; no independent playback timer.
  Rebinding replaces ports while retaining the cursor and remaining time.
  Instant/reduced-motion mode exposes the final frame without frame sounds.
- `GameFeedback`: builds prepare/enter/hold/leave groups for committed public events.
  Speech, reveals and movements keep their existing semantic ordering and
  duration budgets. Movement and short participant feedback share an interval.
  Reveal renderers and request-card flights remain renderer ports; their
  cleanup/generation guards are retained. Root cancellation clears the queue
  and resolves feedback waiters. Each accepted transition retains its own initial
  and final scene even while another transition is playing. The DOM adapter holds
  semantic participant counters at the current scene during redraw, then restores
  the committed counters. Skip discards pending cues and renderer waiters without
  resetting the committed-event cursor.

Mage produces semantic phase plans; all packs produce EntityRefs and scene
geometry. DecisionWindow is integrated with durable authority. Field rendering
holds authorized scenes independently from current controls, measures committed
targets synchronously, and advances per-event checkpoints under the same player.
Specialized motion/reveal ports share that clock and cancellation lifecycle.
Rules do not wait for this player; UI pacing gates only subsequent UI/bot work.

Checks: existing `case/game-flow`, `case/game-feedback`,
`case/network-feedback-browser`, and the named Mage playback regression.
Use the test runner's explicit `--list` selection and exact companion policy.

## Platform effect lifetime
The second effect-port argument supplies `animation(animation)`,
`schedule(callback, delay)`, `unschedule(token)`, `cleanup(callback)` and
`current()`. WAAPI handles are registered by the web renderer, never serialized
in the plan. Pause freezes both animations and delayed labels; rate changes
preserve remaining semantic delay. Cancel/skip remove effects and pending labels.
Request cards remain in the same lifetime through lift, exchange and return.
Local, network and history motion pass this context through GameFlow; these
paths no longer start a separate minimum-duration scheduler inside a cue.
Standalone motion ports still accept calls without a plan context.

All 15 pack views render SceneModel rather than rule projection data. Public
board fields render independently, retaining the current checkpoint during
destination measurement and movement; the final field is committed afterward.

Finite CSS animations of phase frames and participant feedback join the same
effect context as WAAPI flights. CSS duration remains semantic time; playbackRate
applies the chosen speed once. Rebinding the same animation handle is idempotent.
Infinite selection pulses do not extend the plan lifetime. Request-card return
finishes inside the last leave group, before the plan disposes its effects.

`PlayroomMotion.surface(mount)` creates an isolated web motion port. Capture,
anchors, pending cards, flights and cancellation belong to that mount; a missing
mount never falls back to another table. Local and network/history controllers
pass the same port to GameFlow and GameFeedback. The default document port is
available for standalone consumers. `GameFlow.present` owns cancellation only;
reading/reveal duration belongs entirely to the plan, without an outer delay.


## Network scene boundary
Authority snapshots contain authorized SceneModel, events and decorated legal
choices, but no domain `data` or `modelProjection`. History scenes have no live
interactions. The public Table receives only its granted public commands;
spectator scenes contain no actionable commands. Client commands canonicalize
against `scene.interactions[].command`, not against translated labels.

The model adapter adds the validated public `decisionWindow` descriptor to the
scene. Client stale-revision retry requires the same window, unchanged own
version, audience, epoch and control revision, and an exact remaining command.
Screen selection uses the viewer's structured scene hand. Phase-specific viewing
time reads `scene.phase`; rules data stays behind the model adapter.

The local candidate uses engineApi 4, viewApi 3 and protocol 3 together.
Old contracts are rejected before execution; archives remain exportable.

### Public objects leaving a board

The event adapter retains a temporary visual for an object removed from an
ordinary board transition. Selection comes from the difference between authorized
initial/final `scene.objects`, using the complete EntityRef and board zones.
`Motion.capture({sceneModel})` captures a departure image only for a visible public
board object; hand objects are excluded even if their cards are locally visible.
The image is a transient Web effect, never scene data or a layout reserve cache.
It holds until the movement interval, fades during that interval and joins the
same PlanPlayer pause/rate/cancel lifetime. Redraw does not duplicate the image;
completion, skip, cancellation and viewport movement remove it. Local, network
and history transitions supply the same authorized scene boundary.

A scene with its own semantic `plan` owns its intermediate objects, so this event
adapter does not add departure images on top of that plan. This mechanism covers
removed board objects only; field target transactions below handle artwork,
arrivals and independent target measurement.

## Authorized board geometry lifecycle

Motion capture receives the viewer-authorized initial SceneModel. Only objects
in zones with `kind: 'board'` are board movers; arbitrary EntityRef namespaces
are supported. CSS names and `checker-`/`token-` prefixes are not classification.
Dedicated `scene.plan` playback owns its geometry and bypasses this adapter.

The surface-local `stage(snapshot, {exclude})` port holds surviving board objects
at their captured positions before their movement event. Repeated staging first
restores original inline translation; it does not accumulate offsets. Routes
with explicit intermediate anchors are excluded and retain their own positions.
`releaseStage()` restores exact inline values and priorities before destination
measurement. Dice-only cues preserve the held board; starting the board movement
marks the boundary so redraw cannot rewind it. Cancellation restores staging and
cancels the active surface flight, including ordinary non-route movement.
Resize/scroll discards stale screen-coordinate reserves.

These ports cover physical object geometry. Field scenes below additionally
cover artwork and public object creation/removal. No private markup is kept for layout.


### Semantic field rendering boundary

The registry exposes `renderField(state, viewer, scene, ui)`. It accepts an already
projected scene of the same audience as the current state, drops rule projections,
clears interaction commands and local selection/view state, and renders in replay
mode. It returns only field content (including validated stock/play groups).
The caller must supply the scene authorized for that exact viewer; the audience
check is not an authorization substitute.

`registry.render(..., {fieldScene})` substitutes only this field. Current hand,
controls, participant composition and layout policy stay with the committed
recipe. The temporary field root is inert. No private HTML is cached.

GameFeedback exposes a held board scene and a `fieldChanged` redraw port. Local
and network surfaces use it before the first movement/reveal interval. At that
interval, the committed field is rendered synchronously before motion measures
its destinations. Cancellation and settlement release held field content. Packs
with an explicit scene plan retain ownership of their phase rendering.

This removes premature final artwork/new objects during pre-movement feedback.
The target transaction below preserves that field during ordinary flights;
per-event checkpoints advance multi-step commands without running rules again.

### Field target transaction

For an ordinary board transition, feedback now
keeps the initial field through the flight. The host supplies `renderField(scene)`;
`Motion.withFieldTargets(html, start, {initialRefs, finalRefs})` temporarily installs that field in its
existing layout box, starts synchronous target measurement, then restores the
exact original nodes in `finally`, before yielding to the browser. It returns the
flight promise, or `null` when the live-target adapter is required. This callback
must start motion synchronously; it must not await before measuring.

Moving and departing originals are hidden, and their inline visibility is restored on
completion or failure. Animation pause/rate/cancel still belong to the existing
plan context. Resize ends a measured-target flight: detached targets must not be
remeasured. The committed field is rendered after settlement, guarded by the
feedback generation so a cancelled session cannot release another session's field.

The ref sets come only from authorized board zones. New public objects fade in
at their target cells; removed objects fade out from captured public artwork.
Hand-only refs and static DOM decorations cannot become these effects. Their
clones use the same flight clock and stay until settlement to avoid a blank gap
before the committed field is installed. Skip/cancel remove them with all flights.

Routes, reveals, dedicated board plans and DOM flip/dice/transfer descriptors
retain renderer adapters under the common player. Generic per-event scenes use
`presentation.eventScenes` below. These adapters do not own a second playback clock.

### Queued field boundaries

While feedback is active, `fieldScene` selects the current boundary's initial
scene before motion and its final scene after motion. It must not fall through to
the latest authority scene: later committed transitions may still be queued.
`initialFieldScene` separately identifies the unplayed phase for measurement and
legacy staging. Entering a different boundary refreshes its field if needed;
settlement/cancellation releases the override back to the live renderer.

A boundary handled by the field motion transaction owns its departures. The
legacy retained-departure overlay does not recreate them on the completion redraw.
This preserves intermediate committed scenes; it does not infer unseen rule
states between several events emitted by one command.


## Промежуточные сцены событий

API 4 адаптер принимает `presentation.eventScenes(projection)` и прикрепляет
проверенные сцены к соответствующим событиям текущей revision. Порядок совпадает
с порядком публичных событий; повторные/неизвестные ID и активные interactions
отклоняются. Обычный PlanPlayer использует для каждого события предыдущую и
конечную сцену. Звуковые события между движениями удерживают последнюю сцену.
Окончание группы освобождает поле; skip/cancel освобождает всю очередь. Скорость
и пауза остаются портами общего scheduler. Domain не зависит от проигрывания.


## Concurrent effects and explicit delays

The group port may return a promise for committing an authorized scene. Cues start
only after that promise resolves. A group ends at the maximum of its minimum
visible duration and all effect completion times, never their sum. Sound ports
must return playback completion, not merely enqueue sound. `Audio.batch` starts
unique sounds concurrently without stopping preceding effects; the plan signal
cancels them. A subsequent group cannot overlap unfinished sound or animation.

`{id: 'reading-pause', kind: 'delay', duration: 300}` is a built-in cue. Put it
alone in a group for a sequential pause, or alongside effects for a concurrent
minimum interval. Its remaining time obeys pause/resume, rate and cancellation.
Reveal reading time is an explicit later stage after reveal entry; routine motion,
participant feedback and speech sounds share their visible interval.

Card transfer checkpoints come from authorized pack presentation. Successive stock
arrivals use separate intermediate hand scenes and flights. Sets and pairs disappear
only at their own checkpoint after arrival. The authority computes rules immediately;
presentation never postpones or recalculates rules to match wall-clock playback.

## Finish places and participant awards

Pack rules record public finish groups and exit timing in the shared end policy.
A single action records all finishing participants in one group; group order gives
dense places, while survival games retain their own result ordering. Optional result
`exits` entries contain `player`, `kind` (`cards`, `domino`, `finished`) and `round`
or `turn`. `lastPlayers` identifies the loser where the rules support that outcome.
Old saved results may omit these fields; no exit history is invented for them.

Participant scenes expose `finishPlace` (zero means unfinished). The common avatar
renderer awards the token during play, and feedback keeps it at the current scene
checkpoint until the finishing action is shown. Old Maid's arrival checkpoint holds
the award until the final pair leaves the hand. Results reuse the same tokens: medals
for 1–3, smaller white numbered discs thereafter, a distinct last-loser disc.

## Release 0.19 integration invariants

Await asynchronous prepare before starting effects. Concurrent cues share one group; advance only after all finite animation/audio promises and the minimum display interval finish (maximum duration, not their sum). Explicit delay cues share pause/rate/cancel. Infinite selection pulses never hold a group. Instant speech prioritizes the answer sound over the question.

Use authorized eventScenes for intermediate hand/count/board/result changes. Transfer cards first, then remove a completed set/pair, reveal it, then expose its result miniature. Rules commit independently of playback. History never exposes live controls. Exit places/timing are rule facts, not inferred from visual order.

Capture only objects needed by the effect; do not clone whole hands or layouts for selection, rotation, or dice-only actions. Retain geometry, not hidden private markup. Viewport changes invalidate pixel reserves; absent/empty hands retain their declared layout zone. Test the generated offline artifact with the exact companion; source tests and publication are separate evidence.


### Звук итогов партии

Событие `finish` не проигрывает звук в очереди GameFeedback. После завершения очереди и открытия результатов локальный и сетевой UI вызывают общий `GameScreen.presentResultSound`: один раз для объекта партии/клиента. Ручное повторное открытие и просмотр истории беззвучны. Выбор: победитель (включая командную победу) — `victory`, последнее место — `defeat`, промежуточное место и ничья — `draw-game`, общий экран хотсита/наблюдатель — `notify`. Настройки отключения звука сохраняют силу.

### Обучение действиям

`application/tutorial-controller.js` сопоставляет действия с целями обучения через порт хранилища. `platform/web/guide-preferences.js` хранит пользовательские настройки и освоенные действия; `app/tutorial-settings.js` отвечает за первое предложение обучения и подтверждение сброса. `app/first-turn-guide.js` — общий пассивный Web-слой над игровым интерфейсом. Он получает только публичную проекцию, legal actions и локальный UI-контекст из локального или сетевого экрана. Он не вызывает команды, не выбирает карту за игрока и не меняет геометрию поля. Рука с четырьмя пальцами движется к центру доступного элемента; текст объясняет следующий шаг. В нативном окне выбора карт слой переносится внутрь dialog, чтобы оставаться видимым в top layer.

Сценарии принадлежат отдельным модулям `presentation/tutorial.js` паков: `Views.registerTutorial(id, context => definition)` вызывается после регистрации renderer. Изолированный загрузчик принимает сценарий только для собственного ID и сохраняет при активации версии. Опциональный вызов позволяет старым приложениям без этой возможности продолжать рендерить пак.

Definition содержит `steps` (`id`, CSS `selector`, локализованный `text`) и полный список `required`. ID обозначает смысл действия, а не конкретную карту, кнопку или жест. Завершённые пункты не повторяются. Невыполненные сохраняются между ходами и фазами до подходящей возможности, в том числе в следующих партиях. Первая/вторая карта Пексесо и первый/второй план Стихий имеют разные ID.

`actions` перечисляет типы успешных команд, `match(action)` уточняет условие: выход с базы, ход дамкой, цвет UNO, изменение длины хода. `interaction:true` разрешает засчитывать локальный выбор до команды; применяется к выбору карты, оппонента или типа действия. Нельзя завершать игровое действие только по нажатию кнопки: отклонённая команда не засчитывается. `capture(owner, viewer)` сохраняет определение **до отправки**, `committed(..., token)` отмечает его после успеха. Поэтому задержанный сетевой ACK не превращает первую карту во вторую. Старые токены инвалидируются при перезапуске. `completion` позволяет учитывать эквивалентную команду даже без открытого промежуточного UI.

Выбирается первый невыполненный доступный видимый элемент. Отсутствующий контроль или `available:false` не закрывают пункт и не блокируют другие пункты. Предварительные условия сценария проверяются отдельно от физической видимости DOM. `concurrent` разрешает одновременный ввод; `complete` временно скрывает подсказку (например, после готового плана), но не стирает список. `phase` больше не сбрасывает прогресс; устаревшие `once`, `advance`, `turn`, `moves`, `wait`, `restartPhase` не управляют завершением обучения.

Освоенные действия сохраняются на устройстве в `playroom.learning.v1.<userId>`, отдельно для каждого ID пака: `enabled`, `prompted`, `mastered: {actionId: revision}`. Основной профиль сохраняет их между партиями; гости хотсита используют собственные идентификаторы участников лобби. WeakMap хранит только временный контекст партии и ожидающие подтверждения. При отключённом обучении не показываются подсказки и не учитываются действия; включение продолжает сохранённый список. Смена настройки и сброс инвалидируют старые подтверждения команд. Подсказки скрываются на чужом ходу, при паузе, передаче устройства, анимациях, отключении связи и просмотре истории; действия ботов и наблюдателей не учитываются.

Пак владеет стабильными смысловыми ID и ревизиями целей (`definition.revisions`, `guide.revisions` или `step.revision`, по умолчанию 1), но не пользовательским прогрессом. Обновление версии пака само по себе ничего не сбрасывает: новые ID и изменённые ревизии требуют обучения, неизменившиеся остаются освоенными. Реестр действий: `playroom-paks/docs/TUTORIAL-ACTIONS.md`.

В начале первого доступного собственного хода приложение предлагает обучение; в лобби, на чужом ходу, во время анимаций и просмотра истории вопрос не показывается. При одновременных действиях учитывается доступность команд участника. Обучение (по умолчанию включено). В настройках компактная строка без заголовка, отделённая линией: «Показывать обучение» и «Заново». Подтверждённый сброс очищает освоенные действия только текущего пака текущего пользователя и включает обучение; отмена ничего не меняет. Блок прослушивания звуков удалён.

После ввода выдерживается 500 мс бездействия; во время удержания указателя рука скрыта. Один MutationObserver и отложенный requestAnimationFrame обновляют координаты; один отменяемый таймер обслуживает задержку, постоянного опроса нет. Слой не перехватывает ввод и не меняет геометрию поля. `prefers-reduced-motion` убирает перемещение и повторяющийся тап.

### История публичных последовательностей

Режим PublicSequence задаётся до рендера: `live` для партии, `still` для неподвижного просмотра истории, `play` для воспроизведения и `pause` для удержания текущей фазы. Повторный bind не перезапускает существующий план. Пауза сохраняет его позицию; продолжение возобновляет тот же план. Внешний проигрыватель истории ждёт `whenIdle(host)` перед следующим снимком и проверяет свой ticket после каждого ожидания. Выход отменяет историю и показывает конечный кадр актуальной партии без повторного проигрывания раунда.

Кадры могут объявлять `progress`; `publicFrames` переносит его в `data-frame-progress`. Заголовок обновляется вместе с кадром, а `liveProgress` относится только к конечному состоянию. Для Стихий фазы завершённого раунда не должны показывать уже увеличенный счётчик следующего раунда.

`FirstTurnGuide.restart(game)` вызывается после подтверждения сброса. Новое обучение ждёт доступных действий пользователя и продолжается между партиями.

Подсказка может объявить `immediate:true` для ограниченной по времени реакции (объявление UNO): она обходит 500 мс ожидания ввода, сохраняя ограничения видимости, активности и анимаций. Остальные подсказки сохраняют обычную задержку.

Пак может предоставить `botReactionDelay(projection, actor, settings, memory)` (0–60000 мс или null для стандартной задержки). Authority отсчитывает задержку от первого обнаружения эпизода; перепланирование не начинает отсчёт заново. Выбор пропуска принадлежит `botReaction`, а не таймеру UI.


## Incremental authored regions (0.21 work in progress)

Pack UI may call `ui.region(id, dependencies, build)` for an independent HTML
region. Dependencies must include all authorized values affecting its markup:
component descriptors, current legal attributes, selection, labels and hints.
Portable/stateless calls return ordinary HTML. The application may supply a
private fragment sink; neither the sink nor its owner reaches pack UI.

The Web adapter parses only changed pure regions and retains authored roots
until diff completes. Each region requires one root and no nested fragment
placeholders. Preparation-sensitive player/hand/public-sequence/layout roots
retain the full preparation path. A geometry-owner change retires parsed reuse.
Currently solitaire columns use this contract; outer recipes and other packs
still need migration. Region reuse is not evidence of whole-scene incremental
rendering or general performance acceptance. See
[measured scope](ux-021/FRAGMENT-PARSER-1104.md).

## Component fragments (preview.16)

GameScreen and PublicSequence split authored markup at existing physical
`data-dom-key` / `data-entity` component boundaries. A render still computes
its authorized description, but unchanged component strings reuse the authored
baseline; DOM.patchChildren visits the changed branches and retains live nodes,
focus, fitted geometry and runtime effects. Unchanged preparation-sensitive
components clone their authored template rather than parse the same SVG again.
The runtime-owned public display is excluded from automatic extraction.

The tokenizer recognizes quoted attributes, comments, HTML void tags, SVG
self-closing tags and title/textarea text. Duplicate keys, unbalanced structures,
raw script/style content and excessive fragment counts use the native full path;
they must never silently drop a component. Inert game-memo templates are cached
separately. Fragments remain viewer/pack/surface scoped. Unkeyed or changed
components can still require parsing; this is not a general reactive-rule system.
The common header cover is also a reusable fragment.

For local public-frame ports, `ui.publicFrames.supportsFragments` advertises
`renderFrame(index, {region})` and a function-valued `live({region})`.
`region(id, markup)` accepts one independent element and returns a template
marker. The host carries the resulting Map outside the serializable scene/wire.
The frame parser prepares changed regions, patches against the authored baseline,
then transfers retained roots to the new baseline. Consumed templates are
invalidated; preparation may retain only the current and next frame, with no
chain of previous baselines. Never move active DOM nodes to build a template.

Example pack calls are Mage's `cell-<index>` buttons and `piece-<player>` roots.
The pack describes component boundaries; the common host owns parsing, reuse,
patching and cancellation. Older hosts receive ordinary inline live markup;
older packs use their existing physical keys without changing saved rule versions.
