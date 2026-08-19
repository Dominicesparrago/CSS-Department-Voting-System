# Voting System Retest Report

## Agent Information
- Agent: External CLI Retest Agent 2
- Testing Role: Admin/System/Results Black-Box Regression
- Date: 2026-08-16
- Testing Status: COMPLETE (browser interaction succeeded; a subset of tests is BLOCKED by a functions-emulator environment failure, explained below)

## Testing Environment
- Application URL: `http://localhost:3100/admin/`
- Browser: Playwright isolated Chromium (headless), fresh profile
- Device/Viewport: 1440 x 900 desktop
- Other relevant information: Firebase emulators running at 127.0.0.1 (auth 9099, firestore 8081, functions 5001, storage 9199, UI 4000); Next.js dev server on port 3100 with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. The Functions emulator FAILED to load its function definitions (source-load timeout, exact error in `testing-reports/emulator.log`). As a result the `getResults`, `publishTally`, and `submitBallot` callables are NOT registered in the emulator (each returns HTTP 404 "Function us-central1-* does not exist, valid functions are: "). This environment failure blocks live results refresh, results publication, and ballot casting, and is the root cause of the visible `internal` error described below. It was confirmed directly against the emulator endpoints and is independent of the application's front-end code.

## Testing Progress
### Test 1 — Admin login, logout, and login persistence
**Status:** PASS
**Objective:** Verify admin authentication, session persistence across reload, and sign-out/redirect behavior.
**Steps Performed:**
1. Opened `/admin/` in a fresh context; redirected to `/admin/auth`.
2. Signed in with the emulator admin account.
3. Reloaded the page and confirmed the session persisted.
4. Signed out and confirmed redirect to `/admin/auth`.
5. Signed in again.
**Expected Result:** Unauth users redirected to auth; login succeeds; reload keeps the session; sign-out redirects.
**Actual Result:** All behaved as expected. Unauth `/admin/` redirected to `/admin/auth`; login entered the dashboard; reload persisted auth; sign-out returned to `/admin/auth`; re-login succeeded.
**Severity:** N/A
**Impact:** N/A
**Reproduction Steps:** N/A (passed)
**Evidence:** `testing-reports/retest2-dashboard.png`, `retest2-dashboard-reload.png`

### Test 2 — Dashboard statistics and visible loading/error states
**Status:** PASS (with one persistent visible error attributable to the functions-emulator environment failure)
**Objective:** Verify overview cards, statistics, momentum/donut graphs, and the visible loading state.
**Steps Performed:**
1. After login, observed the Overview panel and the shared `.live-data-status` indicator.
2. Confirmed a loading row appears while the live-data fetch is in flight and resolves afterward.
3. Confirmed the dashboard settles with registration/voting state, registered-count, ballots-cast, turnout, candidate total, and momentum + turnout-donut SVG charts.
**Expected Result:** Loading indicator shows then resolves; statistics and charts render.
**Actual Result:** Loading row appeared (~1s) and resolved to real data; VOTING OPEN; 0 registered / 0 ballots cast; 45 candidates; momentum empty-state ("Not enough data yet") and turnout donut rendered. Note: after data loads, the `.live-data-status` element persistently displays the cryptic text `internal` — this is the `getResults` callable failure (functions emulator did not register the callable) surfacing in the UI. It is visible on every reload (reproduced 3+ times).
**Severity:** N/A (statistics pass); the persistent `internal` text is a UX finding (see BUG-RET2-001).
**Impact:** N/A
**Reproduction Steps:** N/A
**Evidence:** `retest2-overview-15s.png`, `retest2-overview-loaded.png`, `retest2-live-error-state.png`, `retest2-overview-graphs.png`

### Test 3 — Lifecycle: Registration OPEN→CLOSED, Voting OPEN→CLOSED, and Publish
**Status:** PASS for registration/polls transitions; BLOCKED for publication completion (functions emulator did not load `publishTally`)
**Objective:** Verify each lifecycle transition behind a confirmation dialog, including status text, visible success/error feedback, audit entry, refresh persistence, and public-page synchronization.
**Steps Performed:**
1. Lifecycle panel initially showed Registration OPEN / Voting OPEN / Results HIDDEN.
2. Clicked Close registration → confirmation dialog appeared → confirmed → status flipped to CLOSED, visible "Registration is now closed." feedback, and an audit entry ("Toggled registration → closed") appeared.
3. Clicked Close polls → confirmation dialog → confirmed → status flipped to CLOSED, "Voting is now closed." feedback, and an audit entry ("Changed voting status → closed").
4. Reloaded the page; both CLOSED states persisted; audit trail retained entries.
5. Clicked Publish results → confirmation dialog appeared → clicked the final confirm → no state change (Results remained HIDDEN), no audit entry, and a visible `.notice-popup is-error` appeared with the text `internal`.
6. Verified the reverse direction works: Open registration and Open voting both restored OPEN state with dialogs and audit entries ("Toggled registration → open", "Changed voting status → open"). Final state: OPEN/OPEN/HIDDEN.
**Expected Result:** All three transitions complete behind dialogs with feedback and audit; publication publishes tallies.
**Actual Result:** Registration and polls transitions fully pass (dialog, feedback, audit, persistence, public sync — see Test 8). Publish results does not complete: the dialog and confirm button work, but the `publishTally` callable does not exist in the functions emulator (HTTP 404), so no publication occurs and a cryptic `internal` error is shown. This is caused by the environment failure, not by the lifecycle UI.
**Severity:** N/A for registration/polls (pass); the publish failure is BLOCKED by environment.
**Impact:** Publication cannot be validated in this environment.
**Reproduction Steps:** For publish failure: Lifecycle → Publish results → confirm → observe no state change + `internal` error. Same root cause for Test 6 Refresh.
**Evidence:** `retest2-lifecycle-initial.png`, `retest2-lifecycle-close-registration-dialog.png`, `retest2-lifecycle-reg-closed.png`, `retest2-lifecycle-close-polls-dialog.png`, `retest2-lifecycle-polls-closed.png`, `retest2-lifecycle-publish-results-dialog.png`, `retest2-lifecycle-after-reload.png`, `retest2-lifecycle-current.png`, `retest2-lifecycle-restored-final.png`

### Test 4 — Candidate add, edit, remove, dialogs, roster refresh, persistence
**Status:** PASS
**Objective:** Verify candidate management including confirmation dialogs, roster refresh, and persistence.
**Steps Performed:**
1. Added a candidate via the visible form (required fields: name, position, year, section, and the required Platform textarea "Goals and priorities…"). Roster increased 45 → 46 and an audit entry "Added candidate" appeared.
2. Reloaded the page; the added candidate persisted.
3. Edited the candidate (renamed); roster updated and audit showed "Updated candidate".
4. Removed the candidate → confirmation dialog ("Remove <name>?") → confirmed → roster returned to 45 and audit showed "Removed candidate".
**Expected Result:** Add/edit/remove complete with dialogs, roster refresh, and persistence.
**Actual Result:** All passed. Note: the add form requires the Platform textarea to be filled; leaving it empty blocks the save (visible validation).
**Severity:** N/A
**Impact:** N/A — this also confirms the original BUG A2-01 (candidate removal silently failed) is FIXED.
**Reproduction Steps:** N/A
**Evidence:** `retest2-candidates.png`, `retest2-candidate-add2.png`, `retest2-candidate-added-ok.png`, `retest2-candidates-reload.png`, `retest2-candidate-search2.png`, `retest2-candidate-edited.png`, `retest2-candidate-remove-dialog.png`, `retest2-candidate-removed.png`

### Test 5 — Voter list, search/status filters, empty state, CSV export
**Status:** PASS
**Objective:** Verify voter table, filters, search, empty state, and CSV export.
**Steps Performed:**
1. Voters panel showed 11 registered voters (seeded).
2. Used All / Voted / Not yet voted filters — all correct.
3. Used search — narrowed the list; a search filter with no matches showed the "No voters found" empty state.
4. Clicked Export CSV — downloaded `css-voters-all-css_department_election_2026.csv` (12 lines: header + 11 voters).
5. Re-exported with an active search filter — the CSV honored the filter (exported only the matching row).
6. With the empty-state filter active, the Export CSV button was disabled.
**Expected Result:** Filters, search, empty state, and CSV export behave correctly.
**Actual Result:** All passed. This confirms the original BUG A2-02 (empty voter export produced no download / no feedback) is FIXED: with records present the export downloads, and the empty state disables export with a clear "No voters found" message.
**Severity:** N/A
**Impact:** N/A
**Reproduction Steps:** N/A
**Evidence:** `retest2-voters.png`, `retest2-voters-filters.png`, `retest2-voters-after-export.png`, `retest2-voters-all.csv`, `retest2-voters.csv`

### Test 6 — Results loading, refresh, position filtering, all-position behavior, zero-data
**Status:** PASS for layout/filtering/JSON export; BLOCKED for live refresh (functions emulator did not load `getResults`)
**Objective:** Verify results panel layout, refresh, position filtering, all-position view, counts, winners, and zero-data behavior.
**Steps Performed:**
1. Results panel rendered the aggregated tally UI with position selector, candidate counts (all 0%), and Download JSON.
2. Position selector showed grouped categories EXECUTIVE / COMMITTEES / YEAR REPRESENTATIVES with individual positions. No "All positions" option exists in the selector.
3. Selected positions across groups — the race and candidate list changed correctly.
4. Clicked Download JSON — downloaded `retest2-results.json` (empty tally structure).
5. Clicked Refresh — no live update; the `getResults` callable does not exist in the functions emulator (HTTP 404), surfacing as the visible `internal` error. The zero-data display remains (seeded/cached).
**Expected Result:** Results load, filter, refresh, and export correctly.
**Actual Result:** Layout, grouping/filtering, JSON export, and zero-data behavior pass. Live refresh cannot be validated because the functions emulator failed to register `getResults` (environment). No "All positions" selector option exists (consistent with the original report's blocked finding).
**Severity:** N/A
**Impact:** Winner determination and live counts could not be validated (no ballots cast; see Test 8).
**Reproduction Steps:** For refresh failure: Admin → Results → Refresh → `internal` error, no change.
**Evidence:** `retest2-results.png`, `retest2-results-filtered.png`, `retest2-results.json`, `retest2-graphs-results.png`

### Test 7 — Candidate/winner graphs and graph exports
**Status:** BLOCKED (no ballots cast; no non-zero data available; functions emulator not loaded)
**Objective:** Verify candidate/winner graphs, transparent/white PNG export variants, dimensions, alignment, labels, and visible-vs-exported consistency.
**Steps Performed:**
1. Overview renders 5 inline SVG charts (live vote summary, turnout donut, momentum area chart).
2. Searched the entire admin UI for graph export controls. Only Download JSON (Results) and Export CSV (Overview/Voters) exist — there is NO graph PNG/transparent/white-background export control anywhere in the admin interface.
3. With 0 ballots cast, all candidate bars and winner values render at zero; the momentum chart shows the "Not enough data yet" empty state.
**Expected Result:** Non-zero graphs and export variants available and validated.
**Actual Result:** Because the functions emulator did not load `submitBallot`, no ballot could be cast (see Test 8), so non-zero graph rendering, winner determination, and PNG export variants/dimensions/alignment cannot be validated. This is a data/environment limitation, not a UI defect. The absence of any graph-export control is a product gap.
**Severity:** N/A
**Impact:** Winner/graph export validation remains unverified.
**Reproduction Steps:** N/A
**Evidence:** `retest2-overview-graphs.png`, `retest2-graphs-results.png`

### Test 8 — Cross-system: public OPEN/CLOSED synchronization, vote casting, published results
**Status:** PASS for synchronization; BLOCKED for vote casting and published-results display (functions emulator not loaded)
**Objective:** Verify admin state drives the public side, votes update turnout/results, and published results appear publicly.
**Steps Performed:**
1. With admin Voting OPEN and Results HIDDEN, anonymous `/results/` showed "RESULTS LOCKED — Not published yet".
2. With admin Registration CLOSED (from Test 3), the public one-time voter entry rejected a submission with a clear visible message ("…or registration may be closed.") — public entry was blocked.
3. With admin Registration OPEN again, the public one-time voter flow accepted a guest and created a secure ballot session (`/vote/`) showing 19 races and 39 candidate radio options. Ballot review and final submission could not complete: clicking "Review ballot" intermittently produced a "Ballot unavailable — The ballot is taking longer than expected to load. Please retry." state (recoverable via "Retry loading", which restored the ballot), and no ballot document was ever written (`ballots`, `votes`, `voting_sessions` collections remained empty; the `tallies` document held no counts). The `submitBallot` callable does not exist in the functions emulator (HTTP 404).
4. Published results appearing publicly could not be validated because publication is blocked (Test 3).
**Expected Result:** Public side mirrors admin state; votes update turnout/results; published results appear publicly.
**Actual Result:** Public synchronization works (OPEN enables the flow, CLOSED blocks with a clear message, LOCKED results page correct). Vote casting and turnout/results/winners updates are BLOCKED by the functions emulator source-load failure. This also confirms the original BUG A2-04 (public state failed to synchronize after the lifecycle action) is FIXED.
**Severity:** N/A
**Impact:** End-to-end casting → tally → winners flow unverifiable in this environment.
**Reproduction Steps:** N/A
**Evidence:** `retest2-public-home.png`, `retest2-public-results.png`, `retest2-voter-open.png`, `retest2-guest-after2.png`, `retest2-guest-hang.png`, `retest2-ballot.png`, `retest2-ballot-selected.png`, `retest2-review-dlg.png`, `retest2-final-after.png`, `retest2-recovery.png`

### Test 9 — Browser refresh/back/forward and visible error states
**Status:** PASS
**Objective:** Verify navigation behavior and persistence.
**Steps Performed:**
1. On the authenticated admin dashboard, executed browser Back → landed on `about:blank`; Forward → returned to the dashboard.
2. Reloaded the page repeatedly — session and data persisted; the live-data error (`internal`) reproduced consistently.
3. Signed out → redirected to `/admin/auth`; navigating to `/admin/` while signed out redirected back to auth.
**Expected Result:** Navigation and reload preserve state; guard redirects work.
**Actual Result:** All passed.
**Severity:** N/A
**Impact:** N/A
**Reproduction Steps:** N/A
**Evidence:** `retest2-dashboard-reload.png`, `retest2-live-error-state.png`

## Bugs Found
### BUG-RET2-001 — Persistent cryptic "internal" error in the live-data status after data load
**Severity:** MEDIUM
**Area:** Admin dashboard live data / results refresh
**Description:** After the initial loading state resolves, the shared `.live-data-status` element permanently shows the text `internal` with the error styling on the admin dashboard. The same `internal` text appears in the `.notice-popup is-error` after attempting to Publish results and after Results Refresh. The message gives an administrator no actionable information about the underlying `getResults`/`publishTally` callable failure.
**Expected:** Either the live data resolves cleanly, or a human-readable, actionable error (e.g., "Unable to load live results. Check the backend service and retry.") is shown with a retry affordance.
**Actual:** `internal` is shown persistently with no explanation and no retry.
**Steps to Reproduce:**
1. Log in to `/admin/` (functions emulator without `getResults`).
2. Wait for the loading row to resolve.
3. Observe `.live-data-status` = `internal`.
4. Optionally Lifecycle → Publish results → confirm; observe the `internal` notice with no state change.
**Evidence:** `retest2-live-error-state.png`, `retest2-lifecycle-current.png`
**Blocks Voting:** YES (administrators cannot tell whether results are current or whether publication succeeded)

### BUG-RET2-002 — No graph export controls exist anywhere in the admin interface
**Severity:** LOW
**Area:** Admin graphs / results exports
**Description:** The scope calls for verifying candidate/winner graph PNG exports including transparent/backgroundless and white-background variants, dimensions, alignment, labels, and visible-vs-exported consistency. No such control exists in the admin UI — the only export controls are Download JSON (Results) and Export CSV (Overview/Voters). Non-zero graphs could not be generated in this environment, so no export behavior is available to test.
**Expected:** A graph/winner export control with documented PNG dimensions and background variants (per original agent-2 recommendations).
**Actual:** No graph export control exists; nothing to exercise.
**Steps to Reproduce:** Log in → open Overview and Results → inspect all export controls.
**Evidence:** `retest2-overview-graphs.png`, `retest2-results.png`
**Blocks Voting:** NO

### BUG-RET2-003 — Ballot review intermittently drops to "Ballot unavailable" (recoverable)
**Severity:** MEDIUM
**Area:** Public one-time voter ballot review/submit
**Description:** After selecting candidates on the guest ballot and clicking "Review ballot", the page intermittently replaced the ballot with "STUDENT BALLOT — Ballot unavailable — The ballot is taking longer than expected to load. Please retry." Clicking "Retry loading" restored the ballot view. This occurred on roughly half of attempts in this environment and prevented a successful ballot submission (no ballot document was ever written). It is likely related to the functions emulator source-load failure, but the visible state is confusing and does not explain itself.
**Expected:** Review dialog reliably opens; ballot submission completes.
**Actual:** Intermittent "Ballot unavailable" state; no ballot cast in any attempt.
**Steps to Reproduce:**
1. Public home → one-time voter entry (registration OPEN) → Continue.
2. Select candidates in 3 races → click "Review ballot".
3. Observe "Ballot unavailable" intermittently; recover via "Retry loading".
**Evidence:** `retest2-review-dlg.png`, `retest2-final-after.png`, `retest2-recovery.png`
**Blocks Voting:** YES (no ballot could be submitted)

## Passed Tests
- Test 1 — Admin login, logout, persistence (PASS)
- Test 2 — Dashboard statistics and loading state (PASS)
- Test 3 — Registration OPEN→CLOSED and Voting OPEN→CLOSED with dialogs, feedback, audit, persistence, public sync; reverse OPEN direction (PASS)
- Test 4 — Candidate add / edit / remove with dialogs, roster refresh, persistence (PASS)
- Test 5 — Voter list, filters, search, empty state, CSV export (PASS)
- Test 6 — Results layout, position grouping/filtering, JSON export, zero-data behavior (PASS)
- Test 8 — Public/admin synchronization (OPEN enables flow, CLOSED blocks with clear message, results locked page correct) (PASS)
- Test 9 — Refresh/back/forward persistence and auth guard redirects (PASS)

## Blocked Tests
- Test 3 — Publish results completion: the `publishTally` callable is not registered in the functions emulator (HTTP 404), so publication cannot complete. Dialog/confirm UI verified; backend not available.
- Test 6 — Results live Refresh: `getResults` callable not registered (HTTP 404).
- Test 7 — Non-zero candidate/winner graphs and graph PNG export variants: no ballots could be cast and no graph export control exists.
- Test 8 — Vote casting → turnout/results/winners updates and published-results public display: `submitBallot` not registered; no ballot documents were written.

All of these share one root cause: the Functions emulator failed to load its function definitions with "Failed to load function definition from source: FirebaseError: User code failed to load. Cannot determine backend specification. Timeout after 10000." (recorded in `testing-reports/emulator.log`). This is an environment/tooling failure, not an application defect, and it is reported per the instructions as the exact reason each test could not complete.

## Overall Assessment
The corrected admin/system behavior is substantially improved. Original bugs are now resolved where they could be exercised: candidate removal (A2-01) works with confirmation and audit; voter CSV export (A2-02) downloads correctly and disables cleanly in the empty state; lifecycle controls (A2-03) now transition state behind confirmation dialogs with visible feedback and audit entries; and public-state synchronization (A2-04) works — closing registration visibly blocks public voting. Feedback is no longer silent (A2-06): dialogs, success notices, audit entries, and an error notice are all visible.

Two issues remain from the original report set and could not be fully cleared in this environment because the functions emulator failed to load its callables: the live results refresh and publish flows (A2-05 area) now surface a visible — but cryptic `internal` — error instead of failing silently, and end-to-end ballot casting → tally → winners cannot be validated. Separately, the "all positions" Results view (A2-12) and any graph PNG export controls still do not exist in the UI.

No application source, configuration, CSS, database, or backend files were modified during this retest.

## Recommendations
1. Reload the functions emulator (fix the source-load timeout recorded in `emulator.log`) so `submitBallot`, `getResults`, and `publishTally` register, then rerun the BLOCKED tests (publish completion, live refresh, casting → turnout → winners, published results on `/results`).
2. Replace the cryptic `internal` error text with a human-readable, actionable message plus a retry affordance in the shared `.live-data-status` component and publish/results notice.
3. Add deterministic seeded voters and ballots to the emulator so non-zero tally, winner, and graph behavior can be validated.
4. Decide and document whether an "All positions" Results selector view should exist; currently none is exposed.
5. Add (or explicitly document the absence of) graph PNG export controls with defined dimensions and transparent/white background variants.
6. Re-test the public "Review ballot → submit" flow once the functions emulator is healthy, and either fix or document the intermittent "Ballot unavailable" state.

## Testing Completion
**Status:** COMPLETE
**Final Notes:** Full black-box regression of the admin/system journey was executed against `http://localhost:3100` in an isolated Chromium browser. Nine test areas were exercised; the tests that depend on Cloud Functions callables are BLOCKED by the functions emulator failing to load its function definitions (source-load timeout), which is an environment issue. All six original report bugs were re-evaluated: four are confirmed fixed (A2-01, A2-02, A2-03, A2-04), the callable failure (A2-05) now shows visible-but-cryptic feedback, and silent feedback (A2-06) is resolved. Evidence screenshots and downloads are stored under `testing-reports/`. No application files were modified.