# Group conversation ownership: final bounded code review

Reviewed the complete `app/room-chat-ui.js` factory/facade and `GroupUI.open` provider, plus the actual callers in Community account reset, GroupUI departure, ChatNotifications and ConversationSearchUI. This is an independent source review of the group-return correction, not a claim that every application module was re-audited.

## Boundaries checked

- Each cloud conversation owns its state, timer, AbortSignal listeners, frame and captured account service/key/generation. A suspended group is retained instead of being overwritten by the next group. Event handlers require their own active element; visibility and read acknowledgement require the presented history.
- Draft/reply/retry stores use the account key captured at construction. `current()` rejects account replacement before close/save accesses the dynamically account-scoped history cache. Account reset retires every view and clears the stores. Targeted group departure closes matching group instances.
- The group provider captures an immutable group ID and service identity. Its calls revalidate the captured service/key/generation. Search's authoritative history boundary and jump callbacks remain tied to their originating view.
- RTC cache delivery, incoming activity and avatar speech routing remain a single facade operation. Only the RTC instance handles live rendering/presentation; `currentGroupId()` and `captureReturn()` select the actual interactive view, not the latest created group.

Three concrete review findings were corrected by the implementation owner:

1. Retired send acknowledgements now require the matching per-view draft-owner Symbol before clearing a saved draft/reply.
2. Persisted pagehide saves owned input/scroll and pauses the timer; pageshow resumes only the current account/context without disposing the retained DOM. Paused views are not interactive.
3. Ordinary successful send acknowledgements now remove a retry only when its ID still matches that acknowledgement, preserving a newer same-group view's retry nonce.

No additional blocking correctness/privacy finding remained in this bounded review. The implementation owner's separate Group A → notification Group B → Back and RTC/dock acceptance covers the actual return flow; this document does not substitute for those checks.

## Affected regression checks

After factory freeze `0dbd79a4e3e32d43c684f779c3f19eeba551e81d49132f7b326f960b61b030d6`, both commands passed **1/1 in Chromium and 1/1 in WebKit**:

```sh
node scripts/codex/test.cjs case/cloud-account-browser --name 'full conversation 0.21:'
node scripts/codex/test.cjs case/cloud-account-browser --name 'invitation badges and cached join actions'
```

The first preserves retained search/target completion, exact bigint jumps, group history restrictions and deferred unavailability. The second preserves invitation state/fairness, account-scoped cache boundaries, actual Leave/rejoin and held old inbox epochs. All four runs have zero native Supabase requests and no page errors. An initial combined `--name` expression matched no tests; it was not counted as a pass and was replaced with the two explicit selections above.

Logs: workspace `tmp_files/ux-021/group-chat-final-review/{a22,a24}-{chromium,webkit}.log`. The runs started on the freeze hash above. `source.sha256`, recorded after completion, contains the final RoomChat source `b533c840718052de3367a6eac8aecc44a61e624e1450a8cd0900642a06c4c8a0`; its sole subsequent delta is finding 3's exact-ID send retry cleanup. These A22/A24 cases do not exercise that send-success branch, so their evidence is reused with this explicit delta rather than represented as reruns on the later hash. `app/group-ui.js` remained `2f430e9754470b227240040ae712499518d02f5dfbb65d238db5a7376f1655d3`.

No production mutation, RPC/SQL change, provider send or physical-device/OS acceptance was performed by this review.
