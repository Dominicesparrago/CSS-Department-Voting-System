# Agent 2 — Admin/System Flow and Results Black-Box Report

Date: 2026-08-16  
Environment: local Firebase emulators and visible Next.js UI at `http://localhost:3100`  
Scope: administrator/system-management and results perspective only. No application source, configuration, CSS, database files, or backend code were edited. Test data was limited to the local emulator.

## Test Results

| ID | Test | Result | Evidence / notes |
|---|---|---|---|
| A2-01 | Admin login with local administrator account | PASS | Reached `/admin/`; dashboard rendered with Admin identity. Screenshot: `admin-login-ready.png`. |
| A2-02 | Dashboard overview and statistics | PASS | Overview showed election status, registered voters, ballots cast, turnout, candidate total, race summary, turnout by year, and momentum empty-state. Screenshot: `admin-overview.png`. |
| A2-03 | Candidates panel and roster | PASS | Roster loaded 44 seeded candidates across all 22 positions; visible add form and active checkbox were present. Screenshot: `admin-candidates.png`. |
| A2-04 | Add candidate | PASS | Added `Black Box Test Candidate` through the visible form with position, year, section, and platform; roster increased to 45 and audit activity showed “Added candidate”. Screenshot: `admin-candidate-added.png`. |
| A2-05 | Edit candidate | PASS (UI path) | Edit opened the selected candidate and populated the existing name/platform/selection fields. Save control was available. The roster does not display platform text, so persistence of the changed platform could not be independently confirmed from the visible roster. |
| A2-06 | Remove candidate | FAIL — BUG A2-01 | Reproduced twice: selecting Remove for the added test candidate caused no visible confirmation, no roster change, and no audit entry; the candidate remained visible. |
| A2-07 | Candidate information visibility | PASS (partial) | Candidate name, position, year, section, and affiliation were visible in the roster; platform/photo are available in the management form but are not shown in roster cards. |
| A2-08 | Voters panel and status filters | PASS (empty-state) | Voters panel rendered `0 registered · 0 voted`, All/Voted/Not yet voted controls, search field, table headings, and a clear “No voters found” state. |
| A2-09 | Voter CSV export | BLOCKED/FAIL — BUG A2-02 | Visible Voters panel exposed Export CSV, but clicking the visible action produced no browser download within 8 seconds. Overview and Results exports did download. No voter records existed to validate CSV contents. |
| A2-10 | Results panel initial tally | PASS (empty data) | Results rendered aggregated tally UI, Refresh, Download JSON, position selector, candidate counts, and 0% states. Screenshot: `admin-results.png`. |
| A2-11 | Results position filtering | PASS | Position selector opened Executive, Committees, and Year Representatives groups. Selecting Internal - VP changed the visible race and candidate list correctly. |
| A2-12 | All-position view | BLOCKED | No visible “All positions” option was available in the Results selector; only individual positions and category headings were exposed. |
| A2-13 | JSON results export | PASS | Downloaded `css-results-css_department_election_2026.json` from the visible Results panel. |
| A2-14 | Overview CSV export | PASS | Downloaded `css-results-css_department_election_2026.csv` from the visible Overview panel. |
| A2-15 | Candidate/winner graphs | BLOCKED | Candidate bars and winner values rendered at zero because no ballots were available. No non-zero winner/graph behavior, graph export, transparent/white background variant, PNG dimensions, or alignment could be validated. |
| A2-16 | Lifecycle state display | PASS (display only) | Lifecycle showed Registration OPEN, Voting OPEN, Results HIDDEN, action buttons, and audit trail. Screenshot: `admin-lifecycle.png`. |
| A2-17 | Close registration / close polls | FAIL — BUG A2-03 | Reproduced with visible panel-scoped buttons. Clicking Close registration and Close polls returned no dialog, no visible error, no status transition, and no new audit event; the panel remained OPEN/OPEN/HIDDEN. Screenshot: `admin-lifecycle-closed.png`. |
| A2-18 | Public-state synchronization | FAIL — BUG A2-04 | Anonymous public home remained on the one-time voter entry screen after the admin lifecycle attempts, while the admin overview still showed VOTING OPEN. Since the lifecycle action itself did not change state, synchronization could not occur. |
| A2-19 | Public results before publication | PASS | Anonymous `/results/` showed “RESULTS LOCKED — Not published yet” with the official-results release message. Screenshot: `public-results.png`. |
| A2-20 | Publish results / winners | BLOCKED | Publish results could not be meaningfully validated because Close polls did not transition the election and no ballot/tally data was available. |
| A2-21 | Results callable and refresh | FAIL — BUG A2-05 | Browser console/network reproducibly reported a CORS failure for `http://127.0.0.1:5001/.../getResults` when the app was opened at `http://localhost:3100`. The visible Results screen still rendered seeded zero counts, but live callable refresh behavior was not proven. |
| A2-22 | Logout and login state | PASS | Sign out control was visible and the admin session could be ended/re-entered through the admin login flow; no credentials or tokens were exposed in evidence. |
| A2-23 | Visible errors and UI defects | FAIL — BUG A2-06 | Lifecycle controls silently no-op with no feedback. Results callable failure is only visible in browser console, not as an actionable UI error. Voter export silently gives no download in the empty state. |

## Bugs Found

### BUG A2-01 — Candidate Remove action has no visible effect

Severity: High for admin data management.  
Reproduction: Admin Login → Candidates → select the added test candidate → Remove.  
Expected: confirmation and removal, or a visible error.  
Actual: no confirmation, no toast/error, no audit entry, and the candidate remains in the roster after repeated attempts.

### BUG A2-02 — Voter CSV export does not produce a download in empty state

Severity: Medium.  
Reproduction: Admin Login → Voters → Export CSV with zero voter records.  
Expected: an empty, valid CSV download or a clear “no records” message.  
Actual: no download and no visible feedback within 8 seconds.

### BUG A2-03 — Lifecycle Close registration and Close polls controls silently fail

Severity: Critical because voting state cannot be administered.  
Reproduction: Admin Login → Lifecycle → click Close registration; repeat in a fresh session with Close polls.  
Expected: confirmation, state transition, and audit event.  
Actual: no dialog, no transition, no error, and no audit event; state remains Registration OPEN / Voting OPEN / Results HIDDEN.

### BUG A2-04 — Public state cannot synchronize after failed lifecycle transition

Severity: High.  
Actual: public entry remains available because the admin action never changes the election state. This is downstream of BUG A2-03 and was cross-checked in a separate anonymous browser context.

### BUG A2-05 — Local Results callable is blocked by CORS

Severity: Medium in the tested local deployment.  
Reproduction: open the app at `localhost:3100`, then load Admin Overview or Results.  
Actual console error: fetch to the Functions emulator on `127.0.0.1:5001` is blocked because the response does not pass the CORS preflight check. The visible screen falls back to zero/seeded display and does not show an actionable error.

### BUG A2-06 — Silent failure feedback across admin actions

Severity: Medium.  
Actual: failed lifecycle and voter-export actions provide no visible success, failure, disabled, or retry state. This makes administrative outcomes ambiguous.

## Passed Tests

- Admin authentication and dashboard entry.
- Dashboard summary cards, empty-state charts, and seeded candidate count.
- Candidate roster loading and candidate creation.
- Candidate edit form opening and field population.
- Voters empty state, table headings, status filters, and search control presence.
- Results tally layout, zero-state counts, refresh control, and position filtering.
- Overview CSV and Results JSON downloads.
- Public one-time voter entry page and locked public results page.
- Visible sign-out/login flow.

## Blocked Tests

- Non-zero vote counting, winners, candidate/winner graph behavior, graph export, PNG dimensions/alignment, and transparent/white graph variants: no ballots were available and lifecycle publication was non-functional.
- Publish-results flow: dependent on successful poll closure and tally data.
- Voter-record content and voted/not-voted data: emulator had zero registered voters.
- All-position Results view: no visible all-position selector option was present.

## Overall Assessment

The administrator shell is navigable and the read-only seeded dashboard, candidate roster, results layout, filtering, and two exports are usable. The system is not operationally ready for an election-management workflow because the lifecycle controls do not change state, candidate removal does not complete, and the live Results callable is CORS-blocked in the tested local browser origin. These failures prevent reliable close/publish/winner verification and leave administrators without visible action feedback.

## Recommendations

1. Repair and instrument lifecycle actions so each click has a confirmed backend result, visible success/error state, and audit entry; add a browser test for OPEN → CLOSED → PUBLISHED.
2. Repair candidate removal with confirmation, error handling, roster refresh, and audit verification.
3. Resolve the `localhost` versus `127.0.0.1` Functions-emulator CORS/origin mismatch, then show an actionable UI error when tally loading fails.
4. Make empty voter export download a valid header-only CSV or show an explicit no-data message.
5. Add deterministic seeded voter/ballot fixtures for black-box verification of turnout, counting, winners, graphs, exports, and PNG variants.
6. Clarify or add an explicit all-position Results view and document graph export dimensions/background behavior.

**Status:** COMPLETE
Final Notes: Admin/system and results black-box testing is complete. The report and visible evidence screenshots are stored under `testing-reports/`. No application source, configuration, CSS, database, or backend files were modified.
