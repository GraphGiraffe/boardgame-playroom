# WebKit UI diagnosis — 2026-11-01

Scope: local Linux Playwright WebKit2359/WPE, source fixture via tests/browser-origin.cjs. This is not a physical iPhone, offline acceptance, or a published-build test.

Command environment: `PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu`; headless WebKit, reducedMotion=reduce, fresh browser context and HTTP origin. The catalog probe uses actual locator.click (no force or evaluate clicks), then DOM geometry measurements. Viewports360×800,390×844,430×932,844×390; views2,3,list. Default action timeout7s; bounded process timeout30–55s during isolation.

## Observations

- Original `/tmp/hod-catalog-inspect.cjs`: fails after roughly1–3 clicks, waiting for visible/enabled/stable; location varies. Subsequent page.evaluate may also stop responding. This is not established as a moving-control layout defect.
- Removing CSS, MutationObserver/ResizeObserver callbacks, cover fitting, tooltips, audio startup, and full catalog rerender separately did not resolve it. These were temporary diagnostic substitutions, not product changes.
- Minimal standalone three-button page:12/12 clicks+viewport changes passed.
- Full app with browser context `serviceWorkers:'block'`:12/12 clicks passed. Both grid modes are square (<0.02px rounding difference), list rows88px, view buttons and room action share a row, no horizontal overflow at all four viewports.
- Minimal three-button page registering an empty worker whose activate handler calls clients.claim:12/12 passed.
- Full app served from a temporary fixture root with original app files and an actual empty sw.js containing activate→clients.claim: click timeout reproduced.
- Same full app and temporary fixture with truly empty sw.js (no claim or fetch handlers):12/12 passed, identical geometry to the blocked-SW run.

## Interpretation and limits

Evidence narrows the problem to interaction between this app and first worker control/claim in this WPE runtime. The full CORE precache, Response.clone/count pipeline and CacheStorage writes are not required to reproduce it. The subsequent isolation below establishes the cause in this runtime. Do not describe this as a confirmed Safari product regression or fix it with layout offsets/force clicks.

page.route is not sufficient to establish which worker script actually ran; final empty-worker comparisons used a separate HTTP fixture root with actual sw.js bytes. No production worker behavior was changed during these comparisons.

Blocked-SW results establish UI geometry/click behavior only. They do not validate service-worker installation, offline startup, push, or update activation.

## UI implementation in this review

mobile-surfaces.css now standardizes root headings; the profile identity is a quiet row with centered52px avatar and right chevron; guest community login is a signed text action; community and active/history tab targets are44px; saved-game transport options are secondary details and import/clear are quiet text actions. Existing palette and catalog art are retained.

## Causal isolation and fix — coder handoff, 02.11.2026

Suppressing only controllerchange listeners allowed12/12 clicks. Instrumentation
showed getRegistration completing, followed by native PushManager.getSubscription
hanging after first claim while Notification.permission was default. CORE precache,
CacheStorage and CSS stability were not the cause. platform/web/push-device.js now
queries the native manager only when permission is granted; default/denied return
null. Explicit subscription retains its existing permission flow.

The coder reran the original12-click catalog probe with the real unmodified SW:
12/12 PASS. Units cover default/denied/granted restoration and explicit subscription.
Our selected actual PWA waiting-build/apply/offline-start check passed2/2. These
real-worker checks differ from earlier blocked-SW geometry evidence. Physical iPhone
behavior is not established by this LinuxWPE diagnosis.
