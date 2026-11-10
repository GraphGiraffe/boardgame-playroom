# Account readiness without repeated navigation validation

Physical symptom: opening Account showed disabled grey account rows before they became active. `AccountUI.show()` always called `execute(() => service.restore())`; `AccountService.perform()` set the global busy state for that read. The adapter's `restore()` always issues an Auth `/user` request, even when its session/access token is still fresh. Browser RED held that unnecessary request after a successful login and observed `disabled=true`; unit RED observed three auth calls instead of the single login for login plus two navigations.

## Bounded correction

`AccountUI.show()` requests `restore({ifNeeded:true})`. The service records only that its current identity was returned by a successful Auth operation in this service lifetime. Constructor `cachedUser()` is status only and does not set readiness. Successful restore/login/signup/callback/password operations set it through one user-acceptance helper; logout, invalid identities and failed restore clear it. Normal explicit `restore()` remains a fresh Auth validation.

Before reusing readiness, the existing sanitized `auth.cachedUser()` identity/kind and recovery status must still match. A cross-tab cache replacement/clear therefore forces actual validation and the existing account-change cleanup. That extra boundary had its own unit RED (stale account A instead of B), then GREEN. No token bytes are read in application/UI code, no TTL/global store is added, and the marker is excluded from snapshots.

The ready path still rejects an existing real busy operation. Password submit, password reauthentication, logout, session expiry/refresh, provider expected-user checks and server RPC authorization are unchanged. Readiness is a UI work-avoidance decision, not a grant of access: opening an already ready menu does not itself promise a fresh server user lookup or detection of server-side revocation. Cold cached state and explicit validation still call Auth. This follows the distinction in Supabase's [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) and [getSession](https://supabase.com/docs/reference/javascript/auth-getsession) documentation: local session/status is not server-side authorization.

## Selected checks

- `node --test tests/account-service.test.cjs`: **27/27 PASS**, including cached status only, cold held restore/busy repeat, ready zero additional lookups, held actual password change and duplicate rejection, logout busy, explicit401 invalidation, expiry refresh and cross-tab identity replacement. Existing recovery/current-password/credential privacy cases remain.
- Existing `case/cloud-account-browser --name 'cloud account: optional launch'`: ready account navigation/Back/reopen with zero extra GET/user; cold reload held lookup with exactly one request across Back/reopen; real held password submit with disabled actual password field and duplicate-submit suppression; two-client isolation, rename, cancelled/accepted logout and root identity updates.
- Existing `case/cloud-account-browser --name 'cloud account: profile identity follows'`: held503 login, Back/reopen, old error ownership, explicit retry and offline cached profile.

Both browser selections run separately in Chromium and WebKit with the existing safe fetch-provider boundary and zero native Supabase requests. Exact terminal status and hashes are in repo `tmp_files/ux-021/account-readiness-1103/report.json` and accompanying logs. The existing test helper now checks only active Account DOM, and the delayed test scopes its form queries to that active frame; retired visual-exit DOM is never treated as the new dialog. No forced click/animation timeout is used to bypass the real controls.

Scope: `app/account-ui.js`, `application/account-service.js`, `tests/account-service.test.cjs`, narrow Account portions/helper in `tests/cloud-account-browser.test.cjs`. `platform/web/supabase-auth.js`, provider protocol, SQL, deployment and credentials were not changed. No full suite or build.
