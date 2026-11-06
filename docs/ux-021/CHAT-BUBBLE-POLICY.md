# A32: one presentation per visible room channel

`RoomChatUI.presented({roomId, scope})` checks the current participant/room, active connected history, inert/hidden ancestors, viewport and scroll clipping, and an actual unobscured history hit. It is a presentation predicate, without seen acknowledgements. Read acknowledgements retain the existing visible-message path and now also require the presented history.

Live room delivery always merges into the correct cache/history. It creates an avatar speech bubble only when that room/channel history is not presented. The reaction presenter repeats this guard for direct callers and retires an existing bubble when its matching history opens, or its room identity changes. Other channels, a closed drawer and the standalone local game reaction path preserve their existing behavior. Team messages remain filtered by the existing authority; no wire/service contract changes.

The existing `game overlays 0.21:` scenario in `tests/lobby-layout-browser.test.cjs` passes **Chromium 1/1 and WebKit 1/1** with actual RTC Domino and team Ludo clients. New checks cover own/incoming room and team messages, a closed corresponding history, a different channel, retirement on opening, quick reaction messages, and a retained drawer covered by real Settings. A message arriving under Settings remains unread in the actual room summary; opening the matching history retires its bubble. Both runs report no page errors and zero native Supabase requests. The game menu intentionally closes the drawer; Settings is the retained overlay used for that check.

Current evidence: workspace `tmp_files/ux-021/ui-platform-audit/{chromium,webkit}-report.json`, `*-team-chat-no-duplicate-390.png`; selected logs copied to `tmp_files/ux-021/cache-list-migration/rtc-{chromium,webkit}.log`.

The old `community lists prefetch at login` browser case now uses actual Chats tab clicks to inspect group rows and verifies they are absent from Friends. Account-scoped disk prefetch, held offline refresh, metadata update, foreign-account isolation and logout checks remain. **Chromium 1/1 and WebKit 1/1 pass**, safe provider native requests zero. Logs: `tmp_files/ux-021/cache-list-migration/{chromium,webkit}.log`.

This is local source acceptance for these policies. No live messages, cloud data or production SQL were changed.
