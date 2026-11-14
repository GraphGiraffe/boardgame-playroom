# Presented community message delivery

2026-11-02, local source fix for the P2 inactive-list notification finding in `FRONTEND-OWNERSHIP-REVIEW-02.md`. No backend, Push policy/provider, message-body contract or read-receipt policy changed.

## Presentation boundary

`app/quick-reactions.js` now treats `listMessage(key,body) === true` as a real presentation result. A matching retained DOM node alone is insufficient. The selected anchor must belong to community content, be connected, and have no hidden/inert/aria-hidden/suspended ancestor. Computed visibility/display/opacity, visual viewport intersection and each overflow clipping ancestor are checked. A hit-test within the remaining clipped rectangle rejects a covered anchor.

There is no shared public visibility primitive with this contract. The existing private helpers in input drop targeting, FirstTurnGuide and layout diagnostics serve different responsibilities; they were not changed or imported across those module boundaries. The new helper is deliberately confined to community bubble presentation.

The bubble retains its exact original anchor rather than querying a possibly different later list by key. The existing animation tick removes it when that anchor disconnects, becomes hidden/covered, leaves the viewport or is fully scroll-clipped. Back does not resurrect a removed bubble. Bubble nodes retain `pointer-events:none`, so their own content cannot invalidate their anchor hit-test.

Standalone community screens opened from a game are valid list owners too. Their body portal uses the actual active owner's computed z-index plus one, so a successful list delivery is visible above that owner's backdrop. Another child surface makes the original anchor inert and removes the bubble. No game-ID branch, fixed global layer or change to game/lobby bubble layers was introduced.

`app/chat-notifications.js` preserves its existing quiet/current-conversation/expired-invitation rules. When a newer message is successfully delivered in the visible list, an older pending banner for that sender is removed and that passive change is rendered even if the pending queue becomes empty. A hidden list returns false and allows the existing banner path. Neither route marks a message read.

## Selected acceptance

Existing `tests/community-actions-browser.test.cjs`, appended case:

```
node scripts/codex/test.cjs case/community-actions-browser --name 'community notification routing:'
```

Final result **Chromium 1/1 PASS** and **WebKit 1/1 PASS**. WebKit uses the existing local runtime environment:

```
PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/community-actions-browser --name 'community notification routing:'
```

The actual app/Community/Chat controllers and local inbox fixture exercise:

- active root list → exactly one bubble, no banner, unread retained;
- repeated polling → no duplicate bubble/banner;
- child settings surface → old bubble removed, list delivery false, one banner;
- actual page scrolling and a bounded overflow scrollport on the actual list DOM → delivery false;
- filtering a retained row → bubble removed and banner used;
- another actual conversation → banner, no foreign list bubble and its draft unchanged;
- visible group row → bubble; hidden group under a child → banner;
- game → standalone community modal → bubble genuinely above the active owner, verified by native hit-testing.

Both final cases assert zero `read-messages`/`group-seen`/`room-chat-seen` actions, zero native Supabase requests and no page errors. Syntax checks for both runtime files/the selected test and `git diff --check` pass. Latest logs: workspace `tmp_files/ux-021/notification-routing/{chromium,webkit}.log`.

During test development, the initial scroll fixture incorrectly assumed the root list had an internal scrollport; the final case uses actual page scrolling plus a separately bounded real-list scrollport. A later fixture assertion used inputValue for the real contenteditable editor; it now checks its textContent. Neither fixture correction changed the production layout/editor.

This is local acceptance of the stated notification route. It does not claim physical Push delivery, all notification types or the whole 0.21 goal.
