# Group members and Community refresh, physical review 2026-11-03

The supplied 4.35s recording shows Group information opening, Back to the conversation, then reopening: the five known member rows disappear into “Загрузка участников…” for roughly the first half-second. At four sampled frames per second the second opening has the same collapse. This is a presentation lifecycle defect, not proof of a server or browser-engine fault.

`GroupUI.info()` previously constructed an empty members container on every opening; `loadMembers()` had no reusable authorized snapshot. Its global generation/request guards also did not identify the exact originating view in error handling. The existing immediate fixture had not held the second response, so it did not observe the blank interval. The extended existing group case reproduced **0 rows instead of 3** before the fix; evidence: repo `tmp_files/ux-021/group-members-1103/chromium-red.log`.

## Correction and privacy

- In-memory member snapshots and in-flight reads are tied to the exact Community service, account key and service generation, then to a group-specific entry. Nothing is added to persistent storage.
- Reopening renders the known rows synchronously and revalidates through `group-info`. Quick Back/reopen reuses one pending RPC. Refresh patches the existing list/row DOM and reserves the status line.
- Member, invite and history actions require fresh successful validation. Temporary failures preserve the known list and expose an explicit retry. The backend remains the authority for every operation.
- Account changes and group leave/list omission discard the snapshot. Authorization failure also clears it when its originating info window has already been closed. Late callbacks cannot repopulate an invalidated group epoch or another account/view.
- Community refresh is now one canonical icon action in the root header (and the standalone Community modal header), with stable `aria-label="Обновить"`, title feedback, disabled/busy state and the existing refresh execution guards. The large action under the tabs is removed. No `app.js` changes were needed.
- The UX owner's Games-only theme quick action was integrated in the same header through its existing `AppearanceUI.settingsButton()` API. Its palette semantics and independent verification belong to that owner.

## Selected local verification

Existing runner case `case/community-actions-browser`, literal selections:

| Selection | Chromium | WebKit | Important coverage |
| --- | --- | --- | --- |
| `group members distinguish` | 1/1 PASS | 1/1 PASS | Cached-first held response, fast Back/reopen exactly one RPC, same list/row/height, temporary error/retry, retired group error, active revocation, revocation after Back, late old-account response, original group forms and partial invite retry |
| `community ownership:` | 1/1 PASS | 1/1 PASS | Header-only refresh, busy/disabled/accessibility, held-refresh native input/list/focus/selection/scroll, background/error/retry, account replacement, root and standalone returns |
| `community quick actions` | 1/1 PASS | 1/1 PASS | Existing actual mouse/touch order and quick actions, root refresh dispatch and saved order |

All use existing safe-provider fixtures and assert zero native Supabase requests and empty browser errors. They do not send real messages/invitations or prove physical-device performance. The test's original form invitation calls are fixture operations only. Cloud-account long-case header selectors were migrated narrowly; that full long scenario was not rerun for a selector-only update.

Visual checks: existing captures at workspace `tmp_files/ux-021/fidelity/application-group-refresh-error-{390,844}-{chromium,webkit}.png` and `tmp_files/ux-021/community-owner/{chats,friends,error}-{390,844}-{chromium,webkit}.png`. The inspected 390px examples show retained members with the retry message and one refresh icon next to fullscreen, with no duplicate body action.

Metrics/logs/frozen hashes are in repo `tmp_files/ux-021/group-members-1103/{report.json,source.sha256}`. No production SQL, provider configuration, network service restart, deployment or protocol/schema changes.
