# Account internal Back — 2026-11-03

The physical Chrome recording showed that the top Back button in account-name and password-change forms closed the entire account screen and exposed Parameters. The quiet “К аккаунту” row already returned to the account overview. These entry points used different navigation boundaries.

## Cause and fix

`AccountUI` renders internal modes inside one owned account surface. The application header, Escape and public `AppBridge.closeModal()` previously popped that surface without consulting its internal navigation.

The application now accepts an optional synchronous `openModal({beforeBack})` callback on the active app-owned frame. Returning `true` consumes ordinary Back before teardown; returning `false` preserves the existing pop. Explicit `closeModal(true)` reset bypasses this callback. Other surface owners and modal validity/disposal remain unchanged.

AccountUI consumes Back only for signed-in, non-recovery account-name, password-change and recovery-request forms. It returns to the overview in the same native surface and restores the corresponding row focus when enabled. A second Back returns to the original Parameters DOM. Guest authentication tabs and the actual recovery callback/password session keep their existing closure semantics.

An internal view revision retires feedback and UI continuations from a form that was left while its request was pending. It does not dispose the account frame or cancel/bypass Auth validation. Existing AccountService busy and duplicate-submit checks still hold until the credential request finishes. Leaving the password form clears its inputs and cached draft through the existing overview render. Username input values are captured before awaiting the provider; a retired form cannot later write the local nickname through a new owner.

## Reproduction and verification

Actual RED: `cloud account: inner Back returns one level and retires late form feedback` logged in through the real Auth adapter and existing safe provider fixture, opened account-name editing, then clicked the top Back. Expected one active account surface; actual zero. Evidence: `tmp_files/ux-021/account-inner-back-1103/red.log`.

The same scenario verifies top Back → overview in the exact frame, second Back → exact Parameters root, Escape and public close, signed-in recovery-request Back, cleared password fields on re-entry, and two held-response boundaries:

- A username-read 503 released after returning and opening password change preserves the new native input, value, focus and selection; it cannot show its error in the new form.
- A password PUT held while Back is pressed retains real busy/duplicate-submit protection. Back clears the password form; the late 503 cannot restore it or inject stale feedback. A fresh entry has empty secret fields.

The adjacent existing optional-launch case checks ready/cold restore, real busy password submission, identity refresh, two isolated clients and logout; the normal-password-change case checks current-password validation and successful field cleanup. Only these explicit cases are selected on Chromium and WebKit. Supabase uses the existing pre-native-fetch fixture; native provider requests are zero. No AccountService, Auth adapter, server, SQL, production data or deployment was changed by this fix.

Commands and exact terminal results are recorded in `tmp_files/ux-021/account-inner-back-1103/report.json`; source hashes and RED/green logs are beside it. This is browser-runtime evidence, not a second physical-device recording.

Final result: all three selected cases pass **1/1 on each engine**, six successful selections total. JavaScript syntax and `git diff --check` pass. Runtime files remained unchanged after the freeze used for the root's `phone-back-1103/final` build; that generated candidate has its separate root verification.
