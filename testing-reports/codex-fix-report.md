# Codex Fix Report

## Testing Reports Reviewed

- Agent 1 initial: `testing-reports/agent-1-student-voting-report.md`
- Agent 2 initial: `testing-reports/agent-2-admin-system-report.md`
- Student retest: `testing-reports/retest-agent-1-student-report.md`
- Admin retest: `testing-reports/retest-agent-2-admin-report.md`

## Issues Found

| ID | Severity | Issue | Source | Status |
|---|---|---|---|---|
| BUG-RET1-001 | CRITICAL | `submitBallot`, `getResults`, and `publishTally` unavailable because the Functions emulator failed to load its source | Both retests | Environment repaired; browser re-run still recommended |
| BUG-RET2-001 | MEDIUM | Admin displayed cryptic `internal` backend errors | Admin retest | FIXED |
| BUG-RET2-002 | LOW | No graph PNG export controls exist | Admin retest | NOT FIXED; product gap |
| BUG-RET2-003 | MEDIUM | Ballot intermittently showed recoverable loading/unavailable state | Admin retest | Mitigated with bounded retry UX; backend restart required for final E2E proof |
| A2-01 | HIGH | Candidate removal appeared ineffective in the first test | Initial admin report | Retest PASS; no code fix required |
| A2-02 | MEDIUM | Empty voter CSV export appeared ineffective | Initial admin report | Retest PASS; no code fix required |
| A2-03 | CRITICAL | Lifecycle close actions appeared ineffective | Initial admin report | Retest PASS; confirmation had not been completed in the original evidence |
| A2-04 | HIGH | Public/admin lifecycle synchronization | Initial admin report | Retest PASS |
| A2-05 | MEDIUM | Local callable CORS/origin mismatch | Initial admin report | Emulator host alignment implemented; callable registration verified |
| A2-06 | MEDIUM | Silent admin action failures | Initial admin report | Retest PASS; actionable error handling improved |

## Issues Fixed

### BUG-RET1-001 — Functions emulator callable registration failure

**Root Cause:** The running local Functions emulator had timed out while loading the backend source, so no callable definitions were registered. A direct Node require of `firebase/functions/index.js` succeeded, confirming the source was loadable and the failure was process/environment state.

**Fix:** Restarted the local Firebase emulator process. The restarted emulator now reports all definitions loaded: `submitBallot`, `getResults`, `createAdminAccount`, and `publishTally`. A direct unauthenticated request to `getResults` returns HTTP 401 instead of the previous 404, proving the callable is registered.

**Files Changed:** None for the emulator restart; runtime state was repaired.

**Verification:** `testing-reports/emulator-restart.log` records all four initialized functions. Backend unit tests pass 8/8.

**Status:** FIXED AT RUNTIME; rerun the complete browser vote/publish flow against the restarted emulator.

### BUG-RET2-001 — Cryptic admin `internal` errors

**Root Cause:** Admin data and lifecycle error paths surfaced raw Firebase callable messages directly.

**Fix:** Added `friendlyAdminError()` to map authentication, permissions, unavailable services, failed preconditions, and internal/backend failures to actionable admin-facing messages. Results refresh failures now remain visible instead of being silently swallowed.

**Files Changed:**

- `voting-app/lib/admin/adminErrors.ts`
- `voting-app/components/admin/console/useAdminElectionData.ts`
- `voting-app/components/admin/console/LifecyclePanel.tsx`

**Verification:** `git diff --check` passes; the backend callable registration was verified after emulator restart.

**Status:** FIXED

### A2-05 — Local emulator host/origin alignment

**Root Cause:** The client always targeted `127.0.0.1` for local emulators even when the app was opened on `localhost`, creating a cross-origin callable path.

**Fix:** Local Firebase emulator connections now use the current browser hostname, keeping `localhost` pages on `localhost` emulator endpoints.

**Files Changed:** `voting-app/lib/firebase/init.ts`

**Status:** FIXED

### BUG-RET2-003 — Unbounded ballot loading state

**Root Cause:** The ballot route could remain in its generic loading screen while data requests were slow or stalled.

**Fix:** Added a 15-second load timeout, an actionable error message, and a Retry loading button. A timed-out request is ignored so a later stale response cannot unexpectedly replace the error state.

**Files Changed:** `voting-app/app/vote/page.tsx`

**Status:** FIXED/MITIGATED

### BUG-002 — Narrow viewport ballot containment

**Root Cause:** Candidate cards and content did not explicitly constrain their minimum/max width at narrow breakpoints.

**Fix:** Added width constraints, box sizing, and overflow wrapping to ballot candidate cards and candidate content.

**Files Changed:** `voting-app/styles/components.css`

**Status:** FIXED; the independent retest also measured zero horizontal overflow at 320px, 375px, and 412px.

## Issues Not Fixed

### BUG-RET2-002 — Graph PNG export controls

**Reason:** No graph export feature currently exists in the admin interface. This is a product-scope enhancement, not a safe bug fix inferred from the available implementation.

### All-position Results view

**Reason:** The Results selector exposes grouped individual positions but no all-position option. This remains a product decision and was not changed without explicit requirements.

### Duplicate-voter wording

**Reason:** Firestore intentionally hides whether a rejected registration is caused by an existing email/ID or closed registration. A precise split requires a deliberate privacy/security design decision.

## Regression Testing

- Student validation and ballot composition: PASS
- Student responsive layout: PASS at 320px, 375px, and 412px
- Student final submission: BLOCKED in the first retest by the stale emulator; callable now registered and requires a fresh browser rerun
- Admin login/session: PASS
- Candidate add/edit/remove: PASS
- Voter filters and CSV export: PASS
- Lifecycle close/open transitions: PASS
- Public/admin state synchronization: PASS
- Results layout/filtering/JSON export: PASS
- Live results refresh: callable now registered; fresh browser verification recommended
- Publish results: callable now registered; fresh browser verification recommended
- Backend ballot validation tests: PASS, 8/8
- Graphs with non-zero data and graph exports: BLOCKED/product gap

### Final browser verification update

After the Functions emulator restart, the in-memory fixture was reseeded locally and the election reopened for testing. The final browser pass then verified: ballot loading, recovery from a slow-load timeout, review of an empty optional ballot, successful `submitBallot` execution, the “Your vote is recorded” confirmation, and duplicate registration rejection after sign-out. The timeout implementation exposed one regression during this pass—its timer was not cleared after a successful load—and that was corrected before the successful submission run.

Admin publication and live results were not re-run through the UI because restarting the emulator cleared the local admin auth fixture; callable registration itself was verified and backend tests remained green. No production data was affected.

## Final Assessment

The tested UI and admin workflows are substantially functional. The major end-to-end blocker was a failed local Functions emulator startup, not an application source-load error; restarting the emulator restored all callable definitions. Admin errors now explain backend failures, and the public ballot has bounded loading recovery and stronger mobile containment.

## Remaining Risks

- A fresh browser pass is still needed to prove a real ballot write, duplicate-vote lock, live tally update, and publication after the emulator restart.
- No deterministic non-zero graph/export fixture currently validates winner graphs or PNG exports.
- Graph PNG export and an all-position Results view remain unimplemented product features.
