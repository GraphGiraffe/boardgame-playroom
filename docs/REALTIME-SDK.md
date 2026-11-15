# Realtime SDK

Область применения: приложение **0.21.0** и коллекция **0.9.0**, engineApi 4 / viewApi 3 / protocol 3. Исторические этапы ниже поясняют совместимость; актуальное приложение доступно на [сайте](https://graphgiraffe.github.io/playroom-hod-test/).

The optional SDK is available to API 4 packs. Existing turn-based packs do not opt in. It supplies ink and guessing mechanics for a future drawing game; it does not add a Crocodile pack.

## Ownership and channels

The host owns accepted operations. `Authority` accepts a `realtime(context)` factory, where context contains `sessionId` and `authorityEpoch`. The factory returns a `PlayroomRealtimeSession.Hub` scoped additionally to a pack-owned `roundId`. A binding supplies its authenticated actor; payload actor fields never choose the sender. Public Table bindings can read checkpoints but cannot draw. Paused/away/bot actors cannot mutate through the binding. A round change requires a fresh hub/client scope.

`Hub` requires these ports:

- `authorize(actor, kind, data)`: synchronous local capability check. Kinds are `read`, `draw`, or internal `finalize`. The pack decides who may draw and erase; no HTTP request occurs per point.
- `commit(operation)`: awaited durable application operation. Persist the accepted operation through the game's journal/storage before resolving. The SDK does not create its own competing save writer.
- `broadcastReliable(envelope)` and `sendToActor(actor,envelope)`: route only to the authorized audience. Await outbound enqueue for reliable broadcasts. The reliable RTC transport performs framing and backpressure.
- `broadcastPreview(envelope)`: publish permitted unfinished prefixes through the optional preview channel.

The host must bind preview admission to the same authorized RTC connection as reliable commands. Call `connected(actor)` on admission/resume and `disconnected(actor)` on loss. `resumed(actor)` returns a reliable checkpoint. Dispose the hub when the round ends. The generic Authority/RTC adapters expose the ports; a pack must supply its durable persistence and audience policy.

The ordered reliable channel carries begin/repair, completed strokes, erasure ranges and checkpoints. `playroom.preview.v3` is a separate unordered channel with `maxRetransmits: 0`. A client paints immediately and sends at most 30 preview packets per second, each at most 4096 bytes / 128 points. A reliable context supplies scope/stroke/style once. Binary PRT3 previews carry its connection-local uint32 reference, sequence/from/count in a 20-byte header, then exact UInt16 coordinate pairs (four bytes per point). Up to 32 contexts and four unknown-reference packets are retained; a missing context requests a bounded reliable repair. Send only the new tail with up to eight overlapping previous points, capped at 128; the host preserves that overlap when relaying. Coalescing retains the latest tail; preview backpressure may drop packets. Reliable operations are never dropped to make room for previews. No drawing traffic is sent through Supabase.

## Ink geometry and repair

`PlayroomRealtime.InkDocument` stores stable stroke IDs and integer coordinates from 0 to 65535. `Client.begin(id, style)`, `append(id, points)`, `commit(id)` and `erase(operationId, targets)` drive the document. Style has a six-digit hex color and width in normalized units. `PlayroomRealtimeCanvas.mount(canvas,{document,client,...})` provides an optional pointer/ResizeObserver adapter; `mode()` selects `draw` or `erase`, `enabled()` applies local interaction policy, and `destroy()` releases listeners.

Point indices never shift. Erasure targets are `{id, ranges:[[first,last],...]}` with inclusive endpoints. Erased points split a stroke into segments, including middle portions. The canvas resamples drawing to make point erasure useful. Its eraser collects ranges during the gesture and commits on release; eraser preview is not broadcast. Resizing changes the canvas backing surface, not document geometry. Preserve the intended canvas aspect ratio in pack CSS.

A rolling overlapping tail repairs short losses. A missing prefix requests a reliable repair; larger gaps use a checkpoint. A stroke commit sends ID/count/sequence and the full SHA-256 of its geometry, not the full point array again. The host requests only a missing tail and rejects mismatched geometry. Readers repair a missing stroke before accepting its compact commit; larger/inconsistent gaps use a checkpoint. Erasures and committed state retain full SHA-256 signatures. Open prefixes and packet sequence counters are excluded from that comparison. A mismatch requests a checkpoint whose full hash is checked before load. `client.idle()` waits for pending proof checks/repairs. These signatures detect divergence; RTC admission and actor policy provide authorization.

On reconnect, a locally retained unfinished tail is resubmitted if compatible with the host prefix. After a 10-second disconnect grace, the host can finalize only points it actually received, marked `truncated`. A later client drops unseen points and receives `onTruncate({id,confirmedPoints,localPoints})`; they are never reported as confirmed drawing.

Bounds per document: 512 strokes, 8192 points per stroke, 65536 points total; 4096 erasure receipts / 512 KiB receipt signatures. A hub accepts at most 64 pending reliable requests / 4 MiB pending input, with 512 KiB per request. Pack/application code must rotate rounds/checkpoints before reaching these limits. The canvas queues at most 128 paint events and redraws from its bounded document if necessary.

## Guessing

`PlayroomRealtime.GuessRound` keeps the answer in private fields. The host creates it with `artist`, `answer`, pack-owned `classify(normalizedGuess, normalizedAnswer)`, awaited durable `commit(result)` and `onSuggestion(suggestion)`. Normalization uses NFKC, case folding and punctuation/space normalization; language-specific synonyms and scoring belong to the pack.

`guess(authenticatedActor,{id,text})` automatically commits `correct`, rejects `reject`, or emits a pending suggestion for `close`. Route suggestions only to the artist. `confirm(authenticatedActor,id,'correct'|'close'|'reject')` accepts only the artist and persists the verdict before scoring. Stable IDs prevent duplicate score commits and reject conflicting retries. Bind actors/scope and route this private port through authorized application commands; never send the answer in a snapshot, preview or suggestion.

## Verified scope

Unit checks cover actor/scope binding, persistence failure/retry, preview limits, missing prefixes, signatures and checkpoint recovery, partial erasure, disconnect truncation and exact/close/manual verdicts. A two-browser WebRTC/canvas check covers live unfinished drawing with dropped preview packets, reliable completion, partial erasure and viewport changes. These are local browser checks, not measurements of latency on a physical phone or a public multi-device drawing session.

The eight-participant real RTC load check streams 7200 points over sixty seconds (120 points/s), exercises preview loss, verifies the unfinished stroke before commit, commits and partially erases it, and compares every final document. Exported evidence records actual elapsed time and per-participant wire bytes.
