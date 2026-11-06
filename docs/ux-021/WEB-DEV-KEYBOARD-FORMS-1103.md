# Web.dev review: tablists and forms — 2026-11-03

This is the bounded keyboard/semantics part of the larger UI review. It does not certify every UI state, screen reader, physical device or geometry. Rules, authority commands, network formats and Auth validation were not changed.

## Reference and chosen contract

[How to review for accessibility](https://web.dev/articles/how-to-review) calls for logical keyboard navigation, meaningful custom-control state and truly inactive hidden content. [Keyboard focus](https://web.dev/learn/accessibility/focus) explains natural order, negative tab stops and visible focus. [Forms](https://web.dev/learn/accessibility/forms) covers labels, descriptions, textual errors and focus. [Building a Tabs component](https://web.dev/articles/building/a-tabs-component) is a link/scroll-snap example, not a requirement to replace this application's button/tab-panel design.

For this application's existing button tablists, selection has one natural tab stop; ArrowLeft/ArrowRight and Home/End activate the owner's real button once and move focus. The shared binder supports RTL direction, disabled tabs and active-surface guards. It has no document-wide observer, duplicate model, second focus trap or synthetic protocol action.

## Actual findings and changes

1. **Settings keyboard RED:** ArrowRight on the first real tab left the second unselected. Data, Community, saved status and room/team chat had the same missing keyboard port. `GameScreen.pageTabs` now emits roving stops; `bindPageTabs`/`syncPageTabs` provide scoped keyboard behavior and panel relationships. The missing owners use their existing click handlers. Native inputs and drafts remain owned by their controllers.
2. **Account invalid-submit RED:** invalid email/password stopped submission through HTML constraints but had neither an associated inline error nor intercepted native validation UI. AccountUI now captures `invalid`, prevents the browser bubble, identifies invalid fields and describes the first error through its existing own inline feedback. Only the first offending field receives that error description and guarded focus. Existing authored description tokens survive correction; only the owned error token is removed. `required`, type, pattern and length constraints remain in force, including an explicit `checkValidity()` gate for synthetic submit events. Invalid submission sends no Auth request.
3. **Busy focus-trap RED:** Shift+Tab from the account header attempted to focus a control disabled through its fieldset. The one existing application trap now filters natural, visible, non-inert stops using `:disabled` and nonnegative tab index. ModalController and SharedViews did not have another competing Tab trap.
4. **Room/team keyboard RED:** the real two-client Ludo team chat did not change channel on ArrowRight. Its own history panel now uses the common binder; existing channel/authority/privacy operations are unchanged.
5. Nearby and rulebook already had Arrow handlers and roving state, but lacked tab-to-panel relationships. Their actual separate panes now have unique IDs and labels. Nearby direction groups remain separate real panes containing their respective method panes; unsupported disabled directions do not advertise nonexistent targets. A single flex-inheritance rule preserves their existing layout wrapper contract.

An early proposed rulebook boundary failure was **not a product defect**: the real reader has a trailing “Понятно” button, so Tab after Brief correctly reaches that button. The test was corrected to follow the actual order, skip the inactive Full tab and wrap after the real final control. The failed assumption is not counted as RED→green product evidence.

## Complete tablist owner inventory

| Owner | Keyboard / tab stops | Keyboard evidence | Tab-panel relationships | Relationship evidence |
|---|---|---|---|---|
| Settings | Shared binder | Actual new browser case | Existing separate panels/IDs | Actual new case |
| Device / Cloud data | Shared binder | Actual new browser case | Shared dynamic panel | Actual new case |
| Community Chats / Friends | Shared binder | Actual new case and retained search | Own real dynamic panel, stable owner prefix | Actual new case |
| Saved Active / History | Shared binder | Actual new browser case | Existing real result list, stable IDs | Actual new case |
| Room / Team chat | Shared binder | Actual RTC ArrowRight, roving and delivery | Current own history panel | Shared binder assertion plus inspected caller; no separate per-channel relationship assertion |
| Account auth tabs | Existing own keyboard; initial stops shared | Actual Home/roving and held Account case | Existing auth-panel IDs/labels | Source inspected; valid/invalid form runtime checked |
| Appearance | Existing own keyboard and selection stops | Source inspected; no fresh full keyboard walkthrough | Own frame-derived IDs/controls and labels | Source inspected |
| Pack manager | Existing own keyboard and selection stops | Source inspected; unchanged owner | Explicit installed/available panels | Source inspected |
| Nearby direction / method | Existing own keyboard and stops | Source inspected; pairing exercises real clicks | Added real direction/method IDs/labels | Actual pairing asserts reciprocal references for enabled tabs |
| Rulebook Brief / Full | Existing own keyboard and stops | Source inspected; actual Tab sequence/wrap checked | Added separate real pane IDs/labels | Actual new case |
| Online invite destinations | Existing own keyboard and stops | Source inspected; unchanged owner | Existing single dynamic invite page | Source inspected |

Manual tablists were searched in application, core, presentation and platform sources, then their actual handlers and markup were read. Generated Account/Appearance/Settings/Data/Community/Saved tablists were included through `pageTabs` callsites. “Source inspected” is not a fresh browser or screen-reader PASS.

## Selected verification and limits

- `case/settings-layout-browser --name 'application tabs keyboard:'`: Settings/Data/Community/Saved keyboard activation and one-stop semantics; exact native settings controls; retained search; Account own keyboard; HTML constraints, owned error descriptions, preserved prior associations, first-error focus and no Auth on invalid submit; real reader relationships/focus order.
- `case/cloud-account-browser --name 'cloud account: inner Back'`: existing held-password busy/duplicate-submit, retained input/selection, late-feedback and Back guards, extended with the actual busy-fieldset Shift+Tab boundary.
- `case/lobby-layout-browser --name 'game overlays 0.21:'`: existing two-client RTC pairing, scene/history/draft preservation, real replies/reactions, team/private scope, plus Nearby relationships and room/team keyboard activation.

Chromium and actual WebKit runs use the existing safe pre-native-fetch provider fixtures; their exact outcomes, source hashes and RED/green logs are in repo `tmp_files/ux-021/webdev-tabs-1103`. The WebKit environment is reproducible from workspace `tmp_files/toolchain/webkit.env`; it does not represent a physical iPhone or assistive-technology run. Native user-font/pinch geometry belongs to the parallel geometry report, not this keyboard PASS.

Final results: all three selected cases pass **1/1 on each engine**. The final keyboard/forms case additionally measures that the first invalid field stays fully visible inside its own account scroller at **390×400** after feedback and focus; both engines pass, so no scroll workaround was added. JavaScript syntax and `git diff --check` pass. Unchanged owners with source-only evidence remain explicitly marked above; this is not an all-states or screen-reader certification.
