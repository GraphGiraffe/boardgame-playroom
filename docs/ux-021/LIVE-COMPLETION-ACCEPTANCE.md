# A16: actual terminal transitions

The selected existing `unified-game-screen-browser` case `live completion 0.21:` passes **Chromium 1/1 and WebKit 1/1**. Both runs have three actual completion journeys, no page errors and zero native Supabase requests. This adds pipeline evidence; no application/domain/authority code needed a correction in this scope.

| Public fixture | Preparation through legal Session transitions | Actual final action | Verified terminal result |
| --- | --- | --- | --- |
| TicTacToe draw | Eight legal placements `0,1,2,4,3,5,7,6`, normal pass mode | Tap cell 8 in the real board | Move 9, `winner: null`, automatic «Ничья!» |
| Defeat by a bot | Four legal placements `0,3,1,4`, human 0 / bot 1 | Human taps cell 8; the actual scheduled bot wins on cell 5 | Move 6, winner 1, automatic «Поражение» |
| Ludo team victory | Seed 2, teams, winner ending, three dice, one starting pawn, no six reroll; 611 legal `botAction` → `prepare`/`commitPrepared` transitions | The actual scheduled teammate 2 moves player 0's last pawn home | Move 612, winners `[0,2]`, human viewer 0 sees «Победа!», four team result badges |

Every preparation remains in `playing` state until it enters the real app. It is stored through `saveLibrary.activateAsync` and opened through the actual saved-game card. The test never edits a raw game position, calls `complete` or mounts synthetic result markup. The uncommitted terminal candidate only verifies the bounded seeded preparation; the runtime bot or UI performs the committed last move. The actual fixture profile is local «Иван» and the legacy save restoration rebuilds its lobby from the real player roster. Pack versions and the preparation/final action are recorded per journey.

Each journey verifies a persisted `finished` record, automatic fullscreen result presentation at 390×844 and 844×390, visible result footer actions and no horizontal page overflow. It opens the actual history, checks its badge against the range's real frame and known complete move count, then uses native End to reach the final frame. Ludo's public-ready batch can start the reader at frame 1; that is distinct from a stuck startup countdown.

Draw/team victory return to a real lobby with no countdown. The bot-defeat journey also presses the actual «Ещё партию» action and verifies a new active save ID. Completed records are absent from Active and present in History; a completed-only library has no active-party badge. Original completed records remain finished when a rematch begins.

Evidence is in workspace `tmp_files/ux-021/live-completion/`: `{chromium,webkit}-report.json`, selected `.log` files, three histories per engine, and result captures for each scenario in both orientations. The landscape result screen uses vertical scrolling; these checks do not claim every score row is simultaneously visible. Viewed Chromium defeat portrait and team victory landscape captures show the actual result and fixed footer, rather than a presenter-only fixture.

Commands:

```sh
node scripts/codex/test.cjs case/unified-game-screen-browser --name 'live completion 0.21:'
LAB_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/unified-game-screen-browser --name 'live completion 0.21:'
```

This is bounded local completion evidence, not a diagnosis of the earlier multiplayer/host-transfer stall or proof of production/device connectivity. No production data or messaging provider was used.
