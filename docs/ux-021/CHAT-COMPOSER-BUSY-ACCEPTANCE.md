# Shared composer pending feedback

Source-only 0.21 change. The common composer reports an outstanding send/attached-reaction mutation through its existing `resize(form, busy)` → `ChatComposer.sync` path. The send circle shows an actual ring while pending; its arrow returns on settlement. The form and button expose `aria-busy`; a separate polite status announces «Отправляем…» outside the busy subtree. Reduced motion keeps the static ring. No extra message, queue, nonce, wire format or layout row was introduced.

`chat-components.js` owns the shared markup; `chat-composer.js` owns feedback state per native form in its WeakMap; scoped rules in `social.css` only alter the existing send button/status. DM, cloud-group and live room/drawer all use this same sync path. The new controlled ACK coverage is DM + cloud-group, not a new physical-device or RTC transport proof.

## Selected verification

Existing `cloud message UX: DM and group replies, reactions, draft return and cancelled reply` passed Chromium **1/1** and WebKit **1/1**, normal motion, safe provider with **native Supabase requests 0** and **page errors []**. Original reply/reaction/SurfaceStack/draft/late-ACK assertions remain. Added both conversation kinds:

- Hold server ACK: visible 20px ring, hidden send arrow, disabled send/reactions, accessible pending label/status, busy form/button.
- Attempt disabled native button click: no duplicate request.
- Multiline draft remains the exact native editor/text node, with the same selection, height and nonzero editor scroll while pending and after 503.
- Successful ACK clears pending feedback and draft. A failed ACK clears pending feedback, preserves draft/context and enables explicit retry; retry reuses its idempotency key and commits exactly one message.
- Picker transitions wait for the retiring presentation to finish before reopening; active-frame forms exclude inert visual exits.

Evidence: `tmp_files/ux-021/composer-busy/{chromium,webkit}.log`, `source.sha256`, actual WebKit `cloud-{dm,group}-sending.png` and reply captures. The DM pending image was visually inspected: spinner occupies the fixed send circle and does not add composer height. JS syntax and scoped diff whitespace checks passed. No build, publication, SQL or live provider operation.
