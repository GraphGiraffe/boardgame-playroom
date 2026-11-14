# Connected surfaces and modal ownership

`platform/web/dom.js` owns one registry per host, shared by every `ModalController` using that host. Parent surfaces stay connected with their original DOM, handlers, editor contents and scroll nodes. A child adds a new sibling layer. Suspended parents are inert and hidden from accessibility; their DOM is not cloned, detached into a return snapshot, or replaced with an image.

## API

```js
const shared = new PlayroomDOM.ModalController({host, background});
const app = new PlayroomDOM.ModalController({host, background});
const parent = shared.open(parentMarkup, {
  mode: 'reset',
  valid: () => !destroyed,
  meta: {owner: 'shared'},
  onDispose: (reason, frame) => cleanup(frame),
});
const back = app.capture();
const child = app.open(childMarkup, {mode: 'push', valid: childIsCurrent});
app.close(child, {reason: 'back'});
app.restore(back); // same connected parent, never a reconstructed screen
```

`open` returns a frozen handle with `id`, `element`, caller-owned `meta`, and a live `state` getter (`active`, `suspended`, `disposed`). Markup has one outer element. `owner` remains a legacy HTMLElement getter; new callers retain the handle.

- `reset` opening replaces the complete host journey. It is the compatibility default for old callers.
- `push` adds a dependent child over the current parent.
- `replace` replaces only the top surface, preserving its parent and return focus.
- `activeFrame()` / `activeRoot()` return the shared host's active handle / original outer element.
- `isActive(frame)` tests top ownership for interaction. Retained background DOM is not a second active window.
- `close(frame, {reason})` removes only this controller's active top frame. A stale owner or suspended frame cannot close another controller's active root.
- `capture(frame = activeFrame())` returns a host-bound token. `restore(token)` unwinds live descendants; it cannot revive a frame after reset, invalidation or disposal.
- `invalidate()` checks validity guards and removes the first invalid frame with its dependent descendants.
- `dispose()` removes the controller's lowest frame and its dependent descendants. A newly independent root opened with `mode: 'reset'` survives destruction of the previous owner.
- `reset({reason: 'reset'})` explicitly clears the entire host without creating markup. Only explicit root navigation should use it.

The outer element receives `data-surface-id` and `data-surface-state`. The registry restores original inert/ARIA attributes, native input selections or rich DOM selections, scroll and focus. Native input selection and document Selection are restored separately: applying both resets textarea selection. Background focus can belong to a connected game-chat editor outside `#app`; the snapshot may read the body, but only the configured background is made inert. If the external editor is still inert until its component observer runs, a guarded animation frame restores focus only when the modal stack is still empty and the same snapshot is current.

## Controller rules

Keep a frame handle and query its `element`, instead of querying the first `.modal` or chat content in the document. Read receipts, focus, commands and visible-conversation notification suppression require an active surface. Passive model/cache updates may target the controller's own retained DOM.

`app.openModal` returns the handle and passes through `mode`, `valid` and `onDispose`. App Back metadata belongs to a surface journey. The shared renderer uses the same registry, with its own owner handle. An old renderer cannot clear a newer independent application root.

Private conversation guards bind account key **and service generation**; room guards also bind room/participant/provider identity. Account UI itself uses its dialog generation rather than account kind, so successful login does not invalidate the dialog that performed it. An auth or room change must invalidate private parents and their dependent panels. A captured return must not reconstruct stale identity from saved markup.

A full conversation opening its participant/group panel uses push and captures the live parent token. It does not call the conversation's close function and later recreate it. Body/reply draft persistence still occurs on input and reply/cancel changes, and a late successful ACK reconciles only its matching account/conversation composition.

## Evidence and migration scope

The existing `cloud message UX:` browser case includes real DOM assertions for connected/inert parents, DOM identity and listeners, textarea and contenteditable selections, focus/scroll, replace-child Back, mixed controllers, dependent disposal, independent reset ownership, invalid guards and dead capture tokens. Its real DM/group UI flow opens a participant/group panel above a filled conversation and verifies the same conversation/form DOM after Back; the held-ACK branch now uses a real child push/pop.

App/shared integration and private controllers use this contract. The remaining global-selector and independent-overlay audit is a separate migration track; this document does not claim that every legacy frontend lookup has already been converted. Confirmations now use this same registry and typed panel contract; the avatar picker's separate host remains outside this migration. See PANEL-STACK-IMPLEMENTATION.md for the confirmation and live game-chat evidence.

## Background network updates

A room-state event is not a navigation request. `network-ui` redraws the lobby only when that lobby is the active surface; current room data and peer updates still advance while a participant/editor panel is above it. Explicit user navigation can still force opening the lobby. Back's active-lobby refresh applies the latest model after restoring the original parent.

`ChatActivity` checks the active modal, native dialog/inert state, and active conversation before visibility-based read acknowledgements or quiet feedback. A connected suspended dock does not count as an actively read conversation. The final real RTC flow sends a message from a second peer while the participant panel is foreground: the actual room summary keeps unread at least one and visibility is false. The same flow verifies original dock/editor DOM, selected text, scroll and focus after Back.

## Stable ownership boundaries in retained roots

Conditional sibling sections need stable data-entity/ID keys, including intro, resume, toolbar and catalogue groups. Equal-source patch optimization may retain live children; unkeyed same-tag peers must not accidentally stand in for a different responsibility after a section appears/disappears. The long social→Nearby→Leave→catalogue trace reproduced missing tiles and now uses these keys, rather than disabling preservation globally. Root Social keeps its opaque host mounted while hidden/inert; navigation retires its pending view capabilities without remounting native inputs. Account replacement still clears identity-scoped content. Nested conversations similarly own separate frames/state/handlers, and internal Back disposes only the child.
