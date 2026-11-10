# Lobby drag and first-player token — 2026-11-03

Scope: seat-card movement and first-player selection in the real lobby. No domain rules, wire formats, RPC/SQL, production data or deployment changed.

## Causes and implementation

- The old lobby drag binder was separate from the canonical ordering controller, blocked native panning with `touch-action:none`, and excluded a participant outside the table from starting a move. The lobby now adapts `PlayroomOrderUI.create` to actual room commands. A host may drag self or bots; a client may drag only self while not ready. Targets are canonical seat IDs; occupied/closed/authority rules remain in RoomService/claim-seat.
- The first-player token was emitted only in assigned mode. The host now sees the current rules/random/assigned status before choosing. Dragging the actual medallion assigns a seated participant with existing `configure({firstPlayerMode:'assigned',firstParticipantId})`; tapping the labelled row arms the same selection. Empty places cannot receive the token.
- A completed mouse drag could produce a compatibility click that opened the moved participant profile. The shared ordering controller consumes this matching release click through `PlayroomDOM.consumePointerReleaseClick`; a fresh pointer sequence remains independent.
- Actual Chrome touch hold exposed competing tooltip ownership: a tooltip hold consumed pointerup before the drag controller. Genuine drag activation now calls the existing `PlayroomTooltips.hide()` port, cancelling its pending hold. No tooltip fork/marker or synthetic activation was introduced.
- Lobby bindings capture room/actor, check active owned DOM and current authority before commands and late error feedback, preserve the same binding over passive renders, and dispose when their host leaves the modal registry. A suspended surface cannot finish a drag. The shared controller retains its old defaults for Community/pack/catalog consumers.
- The lobby now uses the canonical modal header. An adjacent pre-existing passive-render focus regression was traced to a runtime heading ID missing from the fresh update tree: replacing that heading moved its focused sibling actions. The shared header owner fixes that ID preservation before patching; focus is not manually reassigned by the lobby.

## Evidence

Original actual failures: the token was absent in default mode; mouse drag release opened a profile; native touch hold lost its completion to the tooltip. The same bounded actual two-client scenario now covers own-seat movement, host bot/self swap, client occupied/closed rejection with unchanged model, first-player assignment visible on both peers, ordinary participant tap, native Chrome touch hold and scrolling, and cancellation when Settings suspends the lobby.

Browser case: `lobby drag 0.21: authoritative seat moves and visible first-player token preserve taps and scrolling` in `tests/lobby-layout-browser.test.cjs`. Reports/captures: workspace `tmp_files/ux-021/lobby-drag-1103`. All six canonical numbered/coloured seats remain present. The RTC transport is real between two local browser clients. Supabase calls use the existing safe fixture; native requests and page errors are zero.

Chromium uses native CDP touch input. WebKit uses controlled PointerEvents for the hold/drag path plus its native mouse/wheel paths; this is not a physical iPhone touch claim.

The existing unit case `lobby drag uses existing host, actor, occupied, closed and assigned-first command boundaries` verifies server-authoritative host/guest/ready/closed/occupied/first-target semantics without altering the commands. Existing Community quick-actions and Unified-lobby cases are selected because the shared input helper and lobby header/binding changed. Exact terminal results and source hashes are recorded beside the reports.

Final selected results: domain command case **1/1**; actual RTC drag case **1/1 per engine**; Community quick-actions **1/1 per engine**; existing Unified lobby **5/5 per engine** (four viewport subcases and their parent). JavaScript syntax and `git diff --check` pass. Evidence bundle: repo `tmp_files/ux-021/lobby-drag-1103/{report.json,source.sha256,*logs}`. The mobile WebKit context uses native PageDown after controlled touch cancellation, since that automation runtime rejects wheel input in mobile mode. It does not substitute a physical iPhone pan test.
