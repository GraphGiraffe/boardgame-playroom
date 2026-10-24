# Ordered presentation execution (local refactor)

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
