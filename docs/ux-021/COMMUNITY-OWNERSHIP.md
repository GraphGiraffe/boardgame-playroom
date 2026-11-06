# A18 Community surfaces and account cache

2026-11-02, local source follow-up to the remaining `community-ui.js` P2 finding in `FRONTEND-OWNERSHIP-REVIEW-02.md`. Source-only; no production, server/schema, provider Push or real message/invitation mutation.

## Responsibilities

The presenter now separates account-wide public list metadata from the state of a particular screen. Each root host or common-registry modal retains its own identity/service generation, query/positions, editing/disclosure state, operation, loading/error/notice and refresh ticket. Interactive controls, swipes and read continuations resolve their exact active owner rather than the first global community node. Account status signals with the same identity do not retire the view.

Cache reads remain shared account metadata. Their identity and sequence checks prevent a retired account or an older read overwriting a later metadata event. Inbox conversations and group updates advance the corresponding cache boundary. Read errors belong to the requesting view; a retired view cannot paint another screen or leave its controls busy. A new root host has a separate operation/refresh lifetime even when it uses the same account cache.

A root host is patched and reused; it is not rebuilt with `innerHTML`. Passive updates preserve native field DOM, focus, selection, scroll and revealed row state. Modal Community retains its real common-stack frame. Explicit return to a retained modal uses a live registry capture; dead captures are not resurrected. Only an explicit no-Back navigation to an already mounted root Community may clear child surfaces. Refresh, account notifications and `show({host})` never perform that root reset.

Account replacement clears queries/private operation state and partitions cache data. Private Community frames invalidate; the public root can display the replacement account. Guest Auth is an explicit continuation into the same connected owner. The old account callback no longer opens Community over another foreground.

Explicit «Прочитано» captures its target and checks the active operation again after reading history and before sending the seen RPC. Retired preparation sends no seen ACK. Friend actions capture their payload and use the existing SocialService identity guards; an already authorized request may complete for its original account, but its result is neither replayed nor presented under a replacement identity.

The action starts before its busy DOM paint. This lets a child picker capture the actual native trigger before disabling it; the underlay can then show busy state without losing the return focus. Page lifecycle cleanup cancels operation/refresh tokens while retaining connected root DOM for a persisted return, and pageshow refreshes that owner. The pageshow listener explicitly waits for account/service initialization.

## Composition and shared boundaries

The accepted reference hierarchy (`reference-social-390.png` / `reference-social-844.png`) is now the actual presenter hierarchy: Chats/Friends tabs, local search, conversation/person rows, one named Create group or Add friend primary, the existing Notifications preferences shortcut, and a quiet «Управление списком» disclosure for Refresh/Order. The old permanent icon-only Add/Edit/Refresh toolstrip is removed. Chats contain people/group conversations; Friends contain people/requests. Create/Add stays visible outside secondary maintenance.

Group identity/routing still comes from the existing GroupUI. A local presentation adapter extracts its existing create footer so this screen can place one primary below the list; no Group template or server contract was rewritten. Existing swipe/⋯ read/play and ordering remain real controls. Focus/scroll restoration does not depend on browser-specific branches.

Only scoped `[data-community-content]` CSS changes remove the raised list wrapper, double inherited margins and clipped outer search focus ring; global menu/form styles are unchanged. Refresh failure has one visible retry action and contextual copy, with cached rows preserved.

The Notifications shortcut uses the current `data-surface-action="child"` contract, so standalone Community → notification preferences → Back retains the actual parent. It opens the existing root preferences controller, not a new settings page.

Root integration is separately owned by the root agent:

- HubPresenter now calls its root GameScreen update with `preserveLayout:true`. The actual background catalog completion proves that the renderer keeps the managed Community subtree; the presenter does not detach/reappend or clone it.
- The online-game picker now stays above its source without creating a temporary room. Cancel preserves the source; explicit selection creates the online lobby, then calls `onSelect({roomId})`. Community fences that deferred callback by account/service generation, play intent and the actual created room ID. No invitation is sent outside the lobby.

## Selected verification

```
node scripts/codex/test.cjs case/community-actions-browser
```

Final **Chromium5/5 PASS**. Same affected file with:

```
HOD_WEBKIT=1 PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/community-actions-browser
```

Final **WebKit5/5 PASS**. This is the single affected file, not a full repository suite. It retains the previous quick actions, group selection/retry, notification routing and friend-search cases, plus the new Community ownership case.

The new case uses real UI/controllers and the existing safe provider fixture. Both engines record **intercepted26, native Supabase0, pageerrors[], seen[]**. It verifies:

- guest/empty/Chats/Friends/error/retry at390×844 and844×390;
- passive list refresh and actual held catalog completion → root Hub repaint, preserving the exact input/content, native focus/selection and query;
- held refresh error → leave root/open Settings, without replacing or painting it;
- newer actual inbox conversation metadata survives an older held hub response;
- retired read preparation sends no seen ACK;
- held friend action across a real account-service switch cannot overwrite the replacement query, cache, errors or operation state;
- persisted page lifecycle events retain the root controls;
- picker Cancel retains exact source input/query/native focus/nonzero page scroll and creates no room;
- explicit selection creates the actual online tic-tac-toe lobby, passes the room-ID callback and sends no message/invitation;
- standalone Community → existing notification preferences → Back retains its actual DOM/native trigger.

Development findings were corrected rather than waived. An initial ordering fixture waited for a second identical held hub request; AccountSync intentionally deduplicates that flight, so the proof now uses a real distinct inbox event without changing/bypassing the adapter. A general boot error from pageshow before init was fixed with an initialization guard. The disable-before-picker focus race was fixed at the presenter action boundary.

Final logs, per-engine reports and ten state screenshots per engine are in workspace `tmp_files/ux-021/community-owner/`. Scoped syntax and `git diff --check` pass. Persisted-page events are a browser lifecycle simulation, not physical Safari history-cache certification. WebKit here is the local runtime, not a physical iPhone; actual network/provider delivery and whole-goal acceptance are separate.
