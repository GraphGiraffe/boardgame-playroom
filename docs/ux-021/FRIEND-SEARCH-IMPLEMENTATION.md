# A19 friend search ownership and states

2026-11-02, local source follow-up to the `social-ui.js` part of P2 in `FRONTEND-OWNERSHIP-REVIEW-02.md`. This does not accept all profile/community functionality or the whole 0.21 goal. No server/domain/production/provider state changed.

## Inventory and boundary

The previous45-line presenter kept global results/error/notice and selected the first `.friends-modal` globally. Search guarded only its result assignment; `execute()` could write a late error/notice into a later search. Account notifications invalidated its generation even for same-identity busy/status changes. `SocialService` already had the correct account-key/generation and in-flight busy boundaries; it was read and left unchanged.

Changes are limited to `app/social-ui.js`, two `[data-friends-dialog]` rules in `app/social.css`, and one appended selected case in existing `tests/community-actions-browser.test.cjs`.

## Runtime behavior

- Each search retains its actual common-registry frame and its own query/results/error/notice/operation. Ownership includes the service instance, account key and service generation. Interactive handlers require that exact active frame and read only its form/controls.
- Back or a different search window retires the previous presentation. Late results/errors cannot paint another window. An obsolete query's result/error is also ignored; editing clears old feedback/retry controls without starting a request.
- Account changes invalidate the old private frame through the existing shared registry; same-identity busy/status signals merely patch its retained DOM. Service/auth guards remain in their application/adapter modules.
- A guest can keep an entered username while opening real Auth. The explicit guest primary says «Войти и найти человека» and resumes only the read-only search after successful login; the quiet account row is login-only. The exact connected parent form/input and query survive the login round-trip. Cancelling Auth clears the pending continuation on restored-parent notification.
- Submitted usernames/payloads are captured before the await. No old friend request is replayed under a new account. An already authorized in-flight RPC may finish for its original account; this frontend has no server-retraction port and does not claim to cancel that committed mutation.
- The same input/form node and native focus/selection survive passive state updates. New search clears old results, so an error does not appear beside an unrelated previous «не найдено».
- Results distinguish incoming/outgoing/accepted relationships, including accepted incoming links that retain their directional flag. Add/Accept are signed quiet actions; pending/already-friend actions are disabled. Identity rows open the existing profile panel and Back restores the original form and native trigger focus.
- Search uses the existing fullscreen community surface and existing menu/button tokens. Two scoped CSS rules remove the nested identity divider and make the primary action fill its form; no global menu row or profile template changed.

## Fresh UI state audit

Compared against `reference-friends-390.png` and `reference-friends-844.png`: search → profile panel, named actions, minimal palette and shared form controls are retained. This follow-up does not claim pixel-identical profile-card acceptance; the profile presentation remains owned by its UX implementation.

Actual captures for **390×844 and 844×390** cover guest, typed query, loading, no-result, error/explicit retry and incoming/outgoing/accepted/new-person results on Chromium and WebKit. The two orientations fit the current surface without horizontal content overflow; landscape uses the existing scrollable body. Visual review found and corrected the old no-result beside a new error, duplicate identity/outer dividers and a guest primary that failed to disclose the Auth transition. Final screenshots were inspected again after those fixes.

Workspace evidence: `tmp_files/ux-021/friend-search/`. Each engine has12 state screenshots, a log and a fixture report. Query/guest/error/relationships/loading outputs contain only dummy fixture identities.

## Selected acceptance

```
node scripts/codex/test.cjs case/community-actions-browser --name 'friend search ownership:'
```

Final **Chromium1/1 PASS**. The same case with the existing WebKit environment:

```
PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/community-actions-browser --name 'friend search ownership:'
```

Final **WebKit1/1 PASS**. Both runs use real Account/Social/Community/Profile controllers with the existing safe provider fetch fixture: **intercepted18, native Supabase0, page errors[]**.

The case proves guest login returns the exact search form/query, same-identity emissions preserve native focus/selection, profile Back returns the exact trigger/form, username `@@` normalization, no-result, explicit retry, incoming→accepted transition, changed-query held error, held search→Back→settings, held search→new search, and held friend request across a real account-service switch. The replacement account sends no replayed request and its new draft/error state remains intact. Started fixture gates are released on cleanup. Earlier development caught an incorrect ModalController constructor argument; the final implementation uses its existing `{host,background}` API.

Affected JS/CJS syntax checks and `git diff --check`: PASS. Other community-global busy/error observations, profile removal/play UX, physical notification delivery and production validation remain outside this bounded follow-up.

## Design follow-up: one retry action

The error state now reuses the existing primary button as «Повторить поиск»; there is no separate duplicate retry control. Feedback sits inside the retained form beside the field/action, and search/network failures use contextual copy without HTTP status text. A typed new query clears that feedback/retry state without an implicit request. The existing case explicitly checks one submit/one retry action and unchanged owner/focus/query/account boundaries.

After this change the same selected case passes Chromium1/1 and WebKit1/1; fresh six-state captures and logs in the same evidence directory supersede the earlier error-state images. The safe provider boundary remains nativeSupabase0 and pageerrors[].
