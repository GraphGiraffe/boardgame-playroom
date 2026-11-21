# Ordered presentation execution (local refactor)

Область применения: приложение **0.21.0** и коллекция **0.9.0**, engineApi 4 / viewApi 3 / protocol 3. Исторические этапы ниже поясняют совместимость; актуальное приложение доступно на [сайте](https://graphgiraffe.github.io/playroom-hod-test/).

## Image resources

Pack installation validates the full media bundle. The Web renderer indexes
the installed image records by path and shares that index for the same
immutable resource array. Both local and remote guest lobbies read media
from the matching installed version and prepare images in idle time. The
scene takes that cache for the same installed resources and
creates any missing URLs on demand. Skin changes, updates and history reuse a
URL while the image path and content stay the same. A scene releases its URLs
on disposal and revokes entries whose path or content changes. The lobby
releases its cache if it closes before the scene takes it. Studio can replace
mutable resource records and refresh the index during an authoring session.

The live network screen and network archive mount the exact locally installed
pack. They share the installed public rules text, rulebook and sounds with
the view. The separate presentation export builds portable asset URLs when
a consumer explicitly requests it.

The model registration adapter exposes a compatibility `data` view. Local
screens and local replay share the read-only data from their authorized model.
Authority retains the model and omits the compatibility field from its
intermediate projection. Direct engine callers still receive detached data
by default.

## Field viewport for enlarged displays (preview.28)

Web GameScreen records the available field grid cell before fitting an intrinsic
board shape. `fieldBounds(mount)` returns current viewport coordinates for that
cell. Shared ActionReveal uses this rectangle, clipped to the visible viewport,
without changing board geometry or the existing physical sizes of cards/dice.
Groups wrap within that area; enlarging the area does not enlarge their objects.
This is a Web geometry port, not SceneModel data or an authority dependency.

## Progressive public frames (preview.14)

Owned registry renders with a `regionSink` expose the optional local
`ui.publicFrames({key, plan, renderFrame, live})` port. `key` names a sequence
within the view; `renderFrame(index)` returns authorized `{markup, label,
players?, progress?, pack?, sound?}`. `live` has the same shape. There are at most
64 historical frames. Functions are renderer ports, never SceneModel/wire data.
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

Evidence and measured limits: planning performance.

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
3. Accept the authorized snapshot. The installed SDK parses and seals the
   QuickJS projection in the host's model ownership registry. Protocol assembly
   can retain its branches in the same process. Ordinary objects still pass
   through the detached copy path, including objects frozen by a caller.
   WebRTC and MessagePort cross their normal serialization boundaries. The
   authority selects the audience before sharing any part of a projection.
   After receipt, the SDK seals the returned local data and commands at the
   QuickJS boundary. The client assembles one immutable projection for event
   checkpoints, the final scene, tutorial and typed input.
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
   The local screen finishes when the effect promise settles. A positive
   screen-level settlement interval uses its own timer.
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
  the committed counters. Phases on the same scene share one overlay. The shell
  releases it before patching, so the next refresh can borrow the new counters.
  Skip discards pending cues and renderer waiters without
  resetting the committed-event cursor.
- The app and Studio use `TabletopAudio.present` for cues in a game phase.
  A sample gets up to 120 ms to start decoding and be ready for playback.
  After that window the cue expires. If decoding later succeeds, the buffer
  stays in the audio cache for the next cue. A cue that starts participates
  in the phase until it ends or the phase is cancelled.
- The presentation clock tracks each active audio group. Pause records its
  position in media seconds and stops its Web Audio nodes. Resume schedules
  the remaining sample or note envelopes at the current rate. Rate changes
  account for elapsed time at the previous rate before rescheduling.
  Cancelling a phase releases its own audio groups and their timers.

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

One synchronous source capture shares computed styles and local rotations
between siblings. The snapshot holds poses and the required visual copies.
Destination measurement and a later cue read the newly mounted layout.
For a checkpoint, GameFeedback requests only the transfer's stock or source
hand art and the authorized board objects that leave that checkpoint.

Player counters belong to the game shell. During playback, GameFeedback
temporarily replaces the counters that differ from the current displayed
checkpoint. It restores the original DOM children before the shell patches
the next frame, so clearing playback releases the committed counters.


## Network scene boundary
Authority snapshots contain authorized SceneModel, events and decorated legal
choices, but no domain `data` or `modelProjection`. History scenes have no live
interactions. The public Table receives only its granted public commands;
spectator scenes contain no actionable commands. Client commands canonicalize
against `scene.interactions[].command`, not against translated labels.

Visibility is resolved on the raw journal before formatting. The game adapter
shares immutable formatted rows for the same authorized fact and player names.
A name change rebinds those labels, and historical positions supply their own
names. The authority retains the shared rows when it composes a local frame.

The model adapter adds the validated public `decisionWindow` descriptor to the
scene. Client stale-revision retry requires the same window, unchanged own
version, audience, epoch and control revision, and an exact remaining command.
Screen selection uses the viewer's structured scene hand. Phase-specific viewing
time reads `scene.phase`; rules data stays behind the model adapter.

The local candidate uses engineApi 4, viewApi 3 and protocol 3 together.
Old contracts are rejected before execution; archives remain exportable.

### Public objects leaving a board

Zone and object descriptors stay in the authorized SceneModel. They address
the visible components and their effects without mounting a second list of
objects in the DOM. Deferred departures retain the mounted source from the
same capture that measured its pose. Only objects leaving the public board
need frozen outgoing artwork.

A route resolves named anchors once per layout pass and shares each measured
rectangle between validation and keyframe construction. A resize starts a new
pass, including when the renderer has replaced the anchor elements.

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

The Web renderer compares layout signatures only when it can capture its own
flight. Frozen published scenes can supply the previous layout at that point.
For mutable input, the renderer records the signature at mount so a later
in-place update cannot change the starting baseline. A routed dice roll can
animate without comparing unchanged pawn positions.

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

Source capture shares a geometry pass across clipping, hand origins, and
visible pieces. A node's screen rectangle and its cumulative ancestor angle
are reused for that pass. Destination geometry uses a fresh pass after the
layout update, including when the same DOM nodes move to new positions.

These ports cover physical object geometry. Field scenes below additionally
cover artwork and public object creation/removal. No private markup is kept for layout.

Inventory placement uses the same motion surface and event phase. It compares
the authorized positions of one `EntityRef` in the initial and final scenes
for the same viewer. A change of slot in a compact tray only updates its
layout. A change of zone or fixed slot can animate the one primary component.
The initiating device can supply its drag-release rectangle for that entity
and exact destination. Those coordinates stay in the screen adapter. History
uses the source rectangle measured in its own earlier frame.

For an anchored carrier, the measured outer box moves while an inner pivot
owns the artwork and its slots. A stationary turn animates that pivot in
place. A move combined with a turn uses the pivot of the single flight clone.
The same phase owns both transforms, so pause, completion and cancellation
release the carrier and its contents together.

When cargo changes its carrier or slot, it keeps its entity ID and gets a
separate flight. A moving carrier omits that cargo from its flight clone. The
receiving slot determines the cargo's final position and orientation. The
initiating screen can use its drag release for the accepted transfer. A public
Table and history measure their own authorized origin and destination.


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
The native SDK recipe supplies its field port directly. Its DOM owner mounts
the selected checkpoint, so the registry can reuse the shell recipe.

GameFeedback exposes a held board scene and a `fieldChanged` redraw port. Local
and network surfaces use it before the first movement/reveal interval. At that
interval, the committed field is rendered synchronously before motion measures
its destinations. Cancellation and settlement release held field content. Packs
with an explicit scene plan retain ownership of their phase rendering.

This removes premature final artwork/new objects during pre-movement feedback.
The target transaction below preserves that field during ordinary flights;
per-event checkpoints advance multi-step commands without running rules again.

When the WebRTC client restores a frame, the checkpoints, action labels and final
scene share the same authorized projection and one installed-pack render.
The host adapter validates checkpoint order and geometry. Checkpoints and the
final scene reuse one turn hint when they receive the same owned projection. A
different audience or input scope can have its own hint. The presentation player
mounts each checkpoint at its event boundary.

### Field target transaction

For an ordinary board transition, feedback now
keeps the initial field through the flight. The host supplies `renderField(scene)`.
`Motion.withFieldTargets(prepare, start)` checks the live field first. For an
HTML-owned field it requests `{html, initialRefs, finalRefs}` from `prepare`,
installs that markup in the existing layout box and starts synchronous target
measurement. It restores the exact original nodes in `finally`, before yielding
to the browser. A mounted SDK port returns `null` before preparing markup or
entity lists. The caller then releases and measures the mounted checkpoint.
The SDK port and detached-HTML path use the same phase and cancellation context.

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

For card tables, `displayScene` and hand-motion preparation look ahead
within the same committed transition. A later transition starts on its own
table after the current cues finish. If it starts a new playback batch,
the first cue compares its checkpoint with the table still mounted from
the previous batch and mounts the new table before motion.
Silent catch-up advances the event cursor without building visual checkpoints.

`GameFeedback.refresh` prepares hand motion after the shell has mounted the
selected scene. Local play, shared views and history use that same entry.
The motion surface mounts the captured outgoing hand once and reuses it
while the cue owns it. A shell patch can replace the live hand, so the
surface measures current destinations and only reapplies the temporary
visibility and position overrides. Starting another transfer, playing the
flight or cancelling releases the old arrival marks and hand overlay.

`GameFeedback.sceneFor(committedScene)` supplies the native SDK scene in local
play, shared views and Studio. It returns the same checkpoint object while the
audience and viewer match the committed scene. The shell still owns input
gating and the latest authorized command projection. When two consecutive
renderer updates share the same frozen scene, the renderer reuses its layout
signature and still updates controls and presentation state.

The SDK renderer checks who owns motion before it captures outgoing DOM.
The generic flight takes a snapshot only for a forward layout change in the
same session and viewer with no host-owned animation or arena phase plan.
Each playback gets its own run identity. Replacing the session cancels the
old run before painting the new board.

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

Studio ставит следующий живой кадр в очередь, пока общий проигрыватель
занят предыдущим. Кадр хранит авторизованный переход. Захват геометрии
начинается после завершения предыдущего перехода. Обновление уже
поставленной в очередь ревизии сохраняет её описание движения.
Смена просмотра или переход по истории освобождает очередь. При переходе
на мгновенный показ Studio сразу отображает последний принятый кадр.

## Concurrent effects and explicit delays

The web motion port captures pieces and applies action effects only on active
shared deck pages. Inactive pages stay mounted for page transitions. A fire
pulse targets the visible mark in the rendered cell, which remains present
after the input control is hidden.

The group port may return a promise for committing an authorized scene. Cues start
only after that promise resolves. The fourth argument, `join`, registers the
completion of finite animations started while mounting the scene. The native
SDK scene uses this argument so sound starts alongside its animation. A group
ends when its minimum visible duration and all registered effects have completed. Sound ports
must return playback completion. `Audio.batch` starts unique sounds
concurrently without stopping preceding effects. The plan signal cancels them.
A subsequent group cannot overlap unfinished sound or animation. Committed
game cues play when the audio context is already running. A pending gesture
unlock leaves the visual phase free to start, with no later retry of that cue.

The card request layer holds each movement at its initial pose during
preparation. Its translation and face flips share the same first live
frame, so a busy layout cannot consume the visible start of the effect.
That same frame boundary starts ordinary flights and ordered transfers.
The plan can hold or cancel a prepared frame. On resume, motion and
its scheduled contact or completion timers start together at the current rate.

Immediate groups advance in order on one stack frame. A pause during mounting
holds the group's cues until resume. Rate changes during mounting take effect
when the group starts its clock after the mount.

A cold sample in a presentation cue has 120 ms to decode. The audio
adapter checks elapsed monotonic time before scheduling a voice, even if
the decode finishes before a delayed timeout callback. The decoded buffer
still serves later cues. Serial preview and interface sounds replace only
the previous serial sequence. They leave voices owned by an active game
phase in place. Cancelling a plan stops its voices, and global stop or
mute releases all playback and pending gaps.

`{id: 'reading-pause', kind: 'delay', duration: 300}` is a built-in cue. Put it
alone in a group for a sequential pause, or alongside effects for a concurrent
minimum interval. Its remaining time obeys pause/resume, rate and cancellation.
Reveal reading time is an explicit later stage after reveal entry; routine motion,
participant feedback and speech sounds share their visible interval.

Card transfer checkpoints come from authorized pack presentation. Successive stock
arrivals use separate intermediate hand scenes and flights. Sets and pairs disappear
only at their own checkpoint after arrival. The authority computes rules immediately;
presentation never postpones or recalculates rules to match wall-clock playback.
For deferred captures, only the miniature hands named by committed arrival
cues are measured. The motion port reads those anonymous slots before the
shell replaces the old field and keeps them for the lifetime of the capture.
An arrival layer borrows the captured public top of a pile while that node is
detached. The layer releases it on completion or cancellation. Ordered
transfers use the same destination pose for the borrowed top and every arrival.

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

## Integration invariants

Await asynchronous prepare before starting effects. Concurrent cues share one group; advance only after all finite animation/audio promises and the minimum display interval finish (maximum duration, not their sum). Explicit delay cues share pause/rate/cancel. Infinite selection pulses never hold a group. Instant speech prioritizes the answer sound over the question.

Use authorized eventScenes for intermediate hand/count/board/result changes. Transfer cards first, then remove a completed set/pair, reveal it, then expose its result miniature. Rules commit independently of playback. History never exposes live controls. Exit places/timing are rule facts, not inferred from visual order.

Capture only objects needed by the effect; do not clone whole hands or layouts for selection, rotation, or dice-only actions. Retain geometry, not hidden private markup. Viewport changes invalidate pixel reserves; absent/empty hands retain their declared layout zone. Test the generated offline artifact with the exact companion; source tests and publication are separate evidence.


### Звук итогов партии

Событие `finish` не проигрывает звук в очереди GameFeedback. После завершения очереди и открытия результатов локальный и сетевой UI вызывают общий `GameScreen.presentResultSound`: один раз для объекта партии/клиента. Ручное повторное открытие и просмотр истории беззвучны. Выбор: победитель (включая командную победу) — `victory`, последнее место — `defeat`, промежуточное место и ничья — `draw-game`, общий экран хотсита/наблюдатель — `notify`. Настройки отключения звука сохраняют силу.

### Обучение действиям

`application/tutorial-controller.js` сопоставляет действия с целями обучения через порт хранилища. `platform/web/guide-preferences.js` хранит пользовательские настройки и освоенные действия; `app/tutorial-settings.js` отвечает за первое предложение обучения и подтверждение сброса. `app/first-turn-guide.js` — общий пассивный Web-слой над игровым интерфейсом. Он получает только публичную проекцию, legal actions и локальный UI-контекст из локального или сетевого экрана. Он не вызывает команды, не выбирает карту за игрока и не меняет геометрию поля. Рука с четырьмя пальцами движется к центру доступного элемента; текст объясняет следующий шаг. В нативном окне выбора карт слой переносится внутрь dialog, чтобы оставаться видимым в top layer.

Сценарии принадлежат отдельным модулям `presentation/tutorial.js` паков: `Views.registerTutorial(id, context => definition)` вызывается после регистрации renderer. Изолированный загрузчик принимает сценарий только для собственного ID и сохраняет при активации версии. Опциональный вызов позволяет старым приложениям без этой возможности продолжать рендерить пак.

Definition содержит `steps` (`id`, CSS `selector`, локализованный `text`) и полный список `required`. ID обозначает смысл действия, а не конкретную карту, кнопку или жест. Завершённые пункты не повторяются. Невыполненные сохраняются между ходами и фазами до подходящей возможности, в том числе в следующих партиях. Первая/вторая карта Пексесо и первый/второй план Стихий имеют разные ID.

Изолированный SDK переводит селекторы локальных элементов в структурированные адреса `local-control`, а ссылки на игровые действия — в разрешённые команды. Web-адаптер отмечает фактическую цель в DOM. Локальный выбор принадлежит интерфейсу, а игровой шаг считается освоенным после успешного ответа клиента. Это относится и к кнопкам SDK во внешних портах игрового экрана, например к готовности в панели руки на арене.

Общий компонент выбора игрока владеет панелью соперника и открываемым окном карт. SDK связывает шаг `player-choice` с кнопкой панели или вариантом в текущем окне после сверки доступных команд. После открытия окна Web переносит общий указатель внутрь нативного диалога. Отмена закрывает окно без команды и сохраняет карточный шаг незавершённым.

При открытии компонент использует один набор допустимых вариантов. SDK подготавливает подписи и адреса вариантов один раз для текущей сцены и передаёт команды по ссылке. Перед отправкой компонент снова сверяется с источником доступных действий, поскольку разрешения могли измениться, пока окно было открыто. Закрытый компонент пропускает обработку кликов по столу.

В живой сетевой партии `app/shared-views.js` передаёт рендереру и контроллеру обучения ссылку на одну проекцию данного зрителя, включая проекцию вне поля `state` в компактном кадре. Адаптер пака переиспользует разрешённый сценарий с уже связанными шагами при совпадении проекции, локального выбора и прогресса. История и наблюдатель используют сцену без целей живого обучения.

`actions` перечисляет типы успешных команд, `match(action)` уточняет условие: выход с базы, ход дамкой, цвет UNO, изменение длины хода. `interaction:true` разрешает засчитывать локальный выбор до команды; применяется к выбору карты, оппонента или типа действия. Нельзя завершать игровое действие только по нажатию кнопки: отклонённая команда не засчитывается. `capture(owner, viewer)` сохраняет определение **до отправки**, `committed(..., token)` отмечает его после успеха. Поэтому задержанный сетевой ACK не превращает первую карту во вторую. Старые токены инвалидируются при перезапуске. `completion` позволяет учитывать эквивалентную команду даже без открытого промежуточного UI.

Выбирается первый невыполненный доступный видимый элемент. Отсутствующий контроль или `available:false` не закрывают пункт и не блокируют другие пункты. Предварительные условия сценария проверяются отдельно от физической видимости DOM. `concurrent` разрешает одновременный ввод; `complete` временно скрывает подсказку (например, после готового плана), но не стирает список. `phase` больше не сбрасывает прогресс; устаревшие `once`, `advance`, `turn`, `moves`, `wait`, `restartPhase` не управляют завершением обучения.

Освоенные действия сохраняются на устройстве в `playroom.learning.v1.<userId>`, отдельно для каждого ID пака: `enabled`, `prompted`, `mastered: {actionId: revision}`. Основной профиль сохраняет их между партиями; гости хотсита используют собственные идентификаторы участников лобби. WeakMap хранит только временный контекст партии и ожидающие подтверждения. При отключённом обучении не показываются подсказки и не учитываются действия; включение продолжает сохранённый список. Смена настройки и сброс инвалидируют старые подтверждения команд. Подсказки скрываются на чужом ходу, при паузе, передаче устройства, анимациях, отключении связи и просмотре истории; действия ботов и наблюдателей не учитываются.

Пак владеет стабильными смысловыми ID и ревизиями целей (`definition.revisions`, `guide.revisions` или `step.revision`, по умолчанию 1), но не пользовательским прогрессом. Обновление версии пака само по себе ничего не сбрасывает: новые ID и изменённые ревизии требуют обучения, неизменившиеся остаются освоенными. Реестр действий: `playroom-paks/docs/TUTORIAL-ACTIONS.md`.

В начале первого доступного собственного хода приложение предлагает обучение; в лобби, на чужом ходу, во время анимаций и просмотра истории вопрос не показывается. При одновременных действиях учитывается доступность команд участника. Обучение (по умолчанию включено). В настройках компактная строка без заголовка, отделённая линией: «Показывать обучение» и «Заново». Подтверждённый сброс очищает освоенные действия только текущего пака текущего пользователя и включает обучение; отмена ничего не меняет. Блок прослушивания звуков удалён.

Обычная подсказка ждёт отпускания указателя и 500 мс бездействия. За это время обновления поля пропускают поиск целей и измерение их геометрии. Доступная подсказка с `immediate:true` сохраняет обычный порядок выбора. Один отменяемый таймер следит за сроком покоя при повторном вводе. MutationObserver и отложенный requestAnimationFrame обновляют видимую цель. Слой пропускает ввод и сохраняет геометрию поля. `prefers-reduced-motion` убирает перемещение и повторяющийся тап.

### История публичных последовательностей

Локальный экран переиспользует неизменяемые проекции трёх последних
запрошенных ревизий. Это позволяет держать общее представление исходного
и целевого кадров перехода вместе с последней ревизией партии. Проекции
разделены по зрителям, включая публичную. При смене сессии или точной
регистрации пака экран сбрасывает кэш. Допустимые действия берутся из
текущего кадра authority и обновляются по её событиям независимо от кэша
представления.

Автоповтор локальной и сетевой истории использует общий
`HistoryController.Playback`. Контроллер удерживает оставшийся интервал
до следующего шага и ждёт завершения текущего шага. На паузе авторский
план, эффекты очереди и нативное движение останавливаются на той же
позиции. Кнопка обновляет только своё состояние. Возобновление
продолжает уже смонтированный кадр и ждёт те же обещания завершения.
Полученный по сети кадр ждёт возобновления перед выбором в истории.
Явный переход по ползунку или выход закрывают прежний запуск и его
ожидания.

Режим PublicSequence задаётся до рендера: `live` для партии, `still` для неподвижного просмотра истории, `play` для воспроизведения и `pause` для удержания текущей фазы. Повторный bind не перезапускает существующий план. Пауза сохраняет его позицию; продолжение возобновляет тот же план. Внешний проигрыватель истории ждёт `whenIdle(host)` перед следующим снимком и проверяет свой ticket после каждого ожидания. Выход отменяет историю и показывает конечный кадр актуальной партии без повторного проигрывания раунда.

Кадры могут объявлять `progress`; `publicFrames` переносит его в `data-frame-progress`. Заголовок обновляется вместе с кадром, а `liveProgress` относится только к конечному состоянию. Для Стихий фазы завершённого раунда не должны показывать уже увеличенный счётчик следующего раунда.

`FirstTurnGuide.restart(game)` вызывается после подтверждения сброса. Новое обучение ждёт доступных действий пользователя и продолжается между партиями.

Подсказка может объявить `immediate:true` для ограниченной по времени реакции (объявление UNO): она обходит 500 мс ожидания ввода, сохраняя ограничения видимости, активности и анимаций. Остальные подсказки сохраняют обычную задержку.

Пак может предоставить `botReactionDelay(projection, actor, settings, memory)` (0–60000 мс или null для стандартной задержки). Authority отсчитывает задержку от первого обнаружения эпизода; перепланирование не начинает отсчёт заново. Выбор пропуска принадлежит `botReaction`, а не таймеру UI.


## Incremental authored regions ( work in progress)

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
measured scope.

## Component fragments (preview.16)

GameScreen and PublicSequence split authored markup at existing physical
`data-dom-key` / `data-entity` component boundaries. A render still computes
its authorized description, but unchanged component strings reuse the authored
baseline; DOM.patchChildren visits the changed branches and retains live nodes,
focus, fitted geometry and runtime effects. Unchanged preparation-sensitive
components clone their authored template rather than parse the same SVG again.
The runtime-owned public display is excluded from automatic extraction.

Native solitaire and elemental arena retain their parsed, detached field and
port trees as the next patch baselines. `DOM.patchChildren` reads those trees
and creates mounted nodes only where an insertion is required. Visual ports
keep their own baselines when the shell relocates a control or player indicator.
For a solitaire card crossing columns, the replacement describes the update
and the original live card retains its identity.

The arena provider names cells, pieces and highlights through a host-local
field region callback. The Web adapter retains unchanged parsed regions
across phases and commits the retained roots after the patch. Public playback
builds the field and participant visuals while the host holds the hand port.
The provider builds the hand toolbar for live interaction.

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

### Владение переходом публичного плана

При новом `scene.plan.id` с непустыми `groups` переход принадлежит проигрывателю
этого плана. Общий обработчик не захватывает параллельную fallback-анимацию
по последнему событию. Пак помечает `sound: null` у фактов, звук которых уже
включён в его публичные кадры; самостоятельные действия сохраняют свой feedback.
Это правило SDK, без ветвлений по ID игры.

В Studio очередь кадров ждёт завершения того проигрывателя, которому
принадлежит переход. Для авторского плана это проигрыватель сцены, для
отдельных событий это `GameFeedback`. При занятом переходе игровой ввод
закрыт. Явная навигация отменяет показ и освобождает очередь.

Звук публичной фазы задаёт пак в её группе через
`{id, kind: 'sound', sounds: ['cue-id']}`. Проигрыватель запускает сигнал
после показа кадра в контексте той же фазы. Следующая группа ждёт завершения
звука и анимаций с конечной длительностью и выдерживает заданную длительность
показа. Отмена передаётся звуковому порту через сигнал
того же запуска. Сценарный отчёт SDK читает эти объявления из разрешённой
сцены.

Живой ход и явное воспроизведение истории получают отдельные запуски одного
плана. Открытие сохранения, переход назад и выбор произвольного кадра показывают
его в завершённом состоянии. Контроллер истории передаёт намерение воспроизвести
следующий видимый шаг, который может объединять несколько ревизий.

### Начальный снимок восстановленного окна

Первый авторизованный снимок живого окна — текущая точка состояния, а не новый
переход. `PublicSequence.setBaseline(host, planId)` подготавливает и монтирует
его итоговый кадр без старой анимации и звука. Метка относится к одному ID и
потребляется при первом live-bind. Новый plan ID проигрывается обычно; явный
режим истории не подавляется.

SharedViews задаёт эту точку при создании окна; локальное приложение — при
возобновлении сохранения. Подготовка off-DOM учитывает её до вставки поля, чтобы
не мелькал исходный кадр. Состояние правил, журнал, команды и ACK не меняются.

## Participant previews and turn handoff (preview.41)

`playerContent.turnPreview` is an optional local presentation hint: `positive` or
`negative`. `H.playerContent(...,{turnPreview:index=>tone})` and the common player
panel render the hint without changing rules, commands, layout or player order.
The pack supplies targets from its authorized projection; editable selection
hints must clear when the choice is unavailable or committed. Infinite preview
pulses do not own presentation time. Reduced motion keeps static colours.

After committed effects, GameFeedback appends an owned `turn-handoff` cue. Its
outgoing/incoming scales come from `PlayroomGameFlow.turnHandoff` (.96/1.07).
If another batch is already queued when this cue starts, the markers stay
held until the last queued batch reaches its handoff cue.
The cue switches displayed turn/next markers together, then pulses whole primary
player panels through `PlayroomMotion.pulseParticipant`. This port freezes the
two affected DOM visuals in the existing fixed motion layer, so scaling never
changes scrollport overflow. Originals and layers restore on completion/cancel. Finite animations use the existing effect context,
so pause/rate/skip/cancel apply. It does not run on initial mount, unchanged turn,
or instant/reduced-motion playback, and never participates in authority timing.

### Motion visual geometry (preview.42)

Computed visual copies retain grid row/column placement, auto tracks, per-axis
gaps, order and flex basis. Participant pulses convert viewport rectangles into
the fixed motion layer's actual origin and CSS scale. Tests compare internal
relative rectangles and the whole card's centre in portrait and landscape;
scrollport integrity alone is not visual equivalence.

### Stable participant nodes (preview.43)

`pulseParticipant` animates the existing primary DOM node in place, without a
visual clone or subtree rebuild. Its ancestor clipping has a short owned lease;
existing scrollbar gutter is preserved. Mini-hand descendants retain their real
CSS context, dimensions and overlap. A replacement/disconnection or resize
cancels the old-node effect, restoring leased properties. An already scrolled
ancestor keeps its position and the pulse is omitted there. Pause/rate/cancel
remain part of the existing effect context.

Reference passing is already the default for object values in JavaScript. This
visual ownership change does not replace immutable history snapshots or network
serialization with shared mutable references. Disappearing piece transfers may
still need a retained visual after the committed renderer removes the source.


### Arrival after public departures

The optional `arrival-departures-v1` SDK feature supports a route with
`arrival: 'after-departures'` and `departures: EntityRef[]` (1–32 unique public
board objects, excluding the arriving entity). The pack names already resolved
public objects; it does not supply timers or recompute captures. The runtime first
moves the arriving piece above the last route/jump anchor, then moves the named
objects from their authorized previous positions to the final scene positions,
and finally settles the arriving piece into its measured final slot. This supports
both capture returns and exchanges; no destination is assumed to be a base.
Other affected stack placements settle after the named departures. Routes without
this opt-in retain their existing timing. Instant/reduced motion, interruption,
resize and cleanup use the existing shared motion lifecycle.

For a destination route without separate authored checkpoints, adjacent
same-revision capture events can share the movement cue. The motion surface
signals contact at the start of the defending objects' departure. The feedback
player uses that signal to highlight affected players and request capture audio
without delaying the approach. The plan context owns pause and cancellation.
The committed events retain their journal order.

## Public player-card status

Packs using this slot declare `sdkFeatures: ["player-status-v1"]`; older hosts reject the update instead of silently losing status information. A Web renderer may supply `playerContent[i].statusHTML` as a string of already authorized public status markup, like `handHTML`. The shared player card owns its right-aligned `.player-status` slot, wrapping and named `player-status` inline-size container. Pack content can use container queries for compact variants. Pack CSS styles only its own markup; it never positions `.player-data` or other application components. Public-frame player cards use the same slot, so indicators follow the displayed state rather than the final authority state.

`statusMinWidth` optionally declares the smallest useful width (integer 24–320px, default24). The shared card wraps the whole status slot before shrinking it below this width; its container lets the renderer switch between full and compact contents without moving the card.

## Общая история и переходы

`presentation/transition.js` выбирает звуковые события и переносы из уже разрешённой проекции. Локальный экран, authority, восстановление сетевого кадра и Studio используют общий фильтр зрителя. Каждый вход передаёт события нужной ревизии или указывает границу уже показанной истории. Перенос без отдельного ограничения передаётся по ссылке. Кадр с эффектами добавляет идентификатор и ревизию.

`presentation/transition.js` определяет переход по авторизованным событиям для игры, истории и SDK. Локальные ходы и просмотр используют один feedback/EventPlan/PlanPlayer/Scheduler. Переход вперёд на соседний presentation checkpoint проигрывает обычные события; переход назад и произвольный jump восстанавливают checkpoint без специальных правил перемещения карт в колоду. Во время упорядоченного переноса сохраняется прежняя видимая верхняя карта стопки, последующие прилёты рисуются выше предыдущих.
