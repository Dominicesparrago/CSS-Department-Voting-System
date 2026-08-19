# Voting System Retest Report

## Agent Information
- Agent: External CLI Retest Agent 1
- Testing Role: Student/Voter Black-Box Regression
- Date: 2026-08-16
- Testing Status: COMPLETE

## Testing Environment
- Application URL: `http://localhost:3000/`
- Browser: Playwright Chromium 151 (headless), fresh profile
- Device/Viewport: Desktop 1280x800; responsive checks at 320x667, 375x667, 412x800
- Other relevant information: Local Firebase emulators (auth 9099, firestore 8081, functions 5001) were running. During the session the election lifecycle was changed to **closed** by the parallel admin retest agent at ~1:21 PM local (Firestore `updatedAt` 05:21:37Z). Evidence of the lifecycle change: `retest2-lifecycle-*.png`. Identification/ballot behavior was therefore observed in two states: OPEN (ballots loaded) and CLOSED (identification rejected).
- Evidence: `retest1-initial-load.png`, `retest-empty-submit.png`, `retest-invalid-email.png`, `retest-invalid-studentid.png`, `retest-section-options.png`, `retest-ballot-loaded2.png`, `retest-ballot-selection-ui.png`, `retest-review-screen.png`, `retest-after-submit.png`, `retest-selection-state.png`, `retest-closed-rejection.png`, `retest-closed-voting.png`, `retest-responsive-320x667.png`, `retest-responsive-375x667.png`, `retest-responsive-412x800.png`.

## Testing Progress

### Test 1 — Initial page load and visible election state
**Status:** PASS
**Objective:** Confirm the landing page loads and shows the voter identification screen.
**Steps Performed:**
1. Loaded `http://localhost:3000/`.
2. Confirmed heading, form fields, and custom selects render.
**Expected Result:** "One-Time Voting" form with Full Name, Student Email, Student ID, Year level, Section, and Continue.
**Actual Result:** Exactly that — 3 text inputs, 2 custom selects (Section disabled until a year is chosen), no console errors, title "CSS Department Voting System".
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest1-initial-load.png`

### Test 2 — Empty form submission
**Status:** PASS
**Objective:** Verify required-field validation on empty submit.
**Steps Performed:**
1. Clicked Continue with all fields empty.
2. Captured all inline errors and `aria-invalid` states.
**Expected Result:** Errors shown for every required field.
**Actual Result:** All five errors shown: "Full name is required.", "Use your official <name>.scc@gmail.com email.", "Student ID must be 7 to 9 digits.", "Select your year level.", "Section is required." Each affected input set to `aria-invalid=true`.
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** Load page → click Continue.
**Evidence:** `retest-empty-submit.png`

### Test 3 — Invalid email, student ID, name, year, section
**Status:** PASS
**Objective:** Verify field-level validation for malformed values.
**Steps Performed:**
1. Entered `notanemail` as email → Continue.
2. Entered `abc` as Student ID → Continue.
3. Left year/section unselected (covered in Test 2).
**Expected Result:** Targeted, specific error messages.
**Actual Result:** Invalid email → "Use your official <name>.scc@gmail.com email." Invalid ID → "Student ID must be 7 to 9 digits." Each only invalidates its own field (other fields cleared to `aria-invalid=false`).
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** Fill invalid email / ID → Continue.
**Evidence:** `retest-invalid-email.png`, `retest-invalid-studentid.png`

### Test 4 — Year/section dependency and all available section options
**Status:** PASS
**Objective:** Verify the section dropdown is disabled until a year is chosen and lists only the selected year's sections.
**Steps Performed:**
1. Observed Section disabled with placeholder "Select year first".
2. Selected "2nd Year" → opened Section → captured options.
3. Selected "3rd Year" after picking a section → confirmed the section resets.
**Expected Result:** Section options depend on the selected year and reset on year change.
**Actual Result:** 2nd Year → BSCS-2A…BSCS-2H (8). 3rd Year → BSCS-3A…BSCS-3F (6). Changing year to 3rd Year after a section was chosen reset the section to "Select section".
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** See above.
**Evidence:** `retest-section-options.png`

### Test 5 — Valid voter identification
**Status:** PASS (election-open state)
**Objective:** Confirm a valid fresh voter is verified and routed to the ballot.
**Steps Performed:**
1. Entered a unique fresh voter (name/email/ID) with 2nd Year / BSCS-2A.
2. Submitted and waited for the secure-session/ballot prepare flow.
**Expected Result:** Redirect to `/vote/` and a loaded ballot.
**Actual Result:** Redirected to `http://localhost:3000/vote/`; ballot rendered "VERIFIED VOTER · Welcome, …", 19 races, 39 candidate options. (Later, after the election was closed, the same flow rejected fresh voters — see Test 12.)
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest-ballot-loaded2.png`, `retest-fresh-voter-final.png`

### Test 6 — Ballot loading: completion, timeout, visible errors, retry
**Status:** PASS (completion) / NOT OBSERVED (timeout/error/retry)
**Objective:** Verify the ballot loads completely and the loading UX appears.
**Steps Performed:**
1. After valid identification, watched the "Preparing your secure voting session…" → "Preparing ballot…" → ballot render sequence.
**Expected Result:** Ballot renders; any load failure shows a visible error/retry.
**Actual Result:** Load completed in ~5s with the two loading states. The timeout/error/retry path was not exercised (no failure was induced); it is not treated as a PASS.
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest-after-valid-id.png`, `retest-ballot-loaded2.png`

### Test 7 — Every available position and whether selection is required/optional
**Status:** PASS
**Objective:** Confirm all positions appear and selection is optional in every race.
**Steps Performed:**
1. Enumerated race headings and radio groups by `name`.
**Expected Result:** 19 races, each marked OPTIONAL.
**Actual Result:** All 19 races present (President → 2nd Year Representative); all labeled OPTIONAL; 39 candidate radios total (2–3 per race). Intro copy confirmed: "19 races in all. Selections are optional in every race."
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest-ballot-loaded2.png`

### Test 8 — Candidate selection and changing a selection
**Status:** PASS
**Objective:** Verify a candidate can be selected and the choice changed.
**Steps Performed:**
1. Selected President Candidate 1 (radio `test_president_1`).
2. Changed to President Candidate 2 (radio `test_president_2`).
3. Selected candidates in 2 more races.
**Expected Result:** Selection is mutually exclusive per race; progress counter updates.
**Actual Result:** Selecting candidate 2 unselected candidate 1 (radio exclusivity holds). "Selected" states and the review progress "N / 19 races selected" updated correctly (0→1→3). Clicking an already-selected candidate does not deselect it (blank-race intent must be achieved by leaving the race unselected).
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest-selection-state.png`

### Test 9 — Review screen and blank-race behavior
**Status:** PASS
**Objective:** Verify the review screen, returning to the ballot, and submitting with blank races.
**Steps Performed:**
1. Selected only 3 of 19 races.
2. Opened "Review ballot →".
3. Clicked "Back to ballot".
4. Reopened review and clicked "Submit final vote".
**Expected Result:** Review lists selections, allows returning, and permits submission with blank races (optional races).
**Actual Result:** Review screen rendered "1 / 19…3 / 19 races selected"; "Back to ballot" returned with all 3 selections intact; review remained accessible; "Submit final vote" was clickable with 16 blank races. No forced-selection error appeared.
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** N/A
**Evidence:** `retest-review-screen.png`

### Test 10 — Final submission and confirmation
**Status:** FAIL
**Objective:** Submit the ballot and reach a confirmation screen.
**Steps Performed:**
1. Selected candidates, opened review, clicked "Submit final vote".
2. Monitored network/console for the submit call and any confirmation UI.
**Expected Result:** Confirmation screen appears and the voter is marked as voted.
**Actual Result:** Submission did not complete. Browser console: `Access to fetch at 'http://localhost:5001/.../us-central1/submitBallot' … blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header`. URL stayed at `/vote/`; no confirmation screen. The function emulator log shows the functions backend failed to load: `Failed to load function definition from source: … Timeout after 10000` and `submitBallot` returns 404 ("Function us-central1-submitBallot does not exist, valid functions are:" — none listed).
**Severity:** CRITICAL
**Impact:** A voter cannot finish casting a ballot in this environment; the core voting action is blocked.
**Reproduction Steps:** Complete a ballot → Review ballot → Submit final vote.
**Evidence:** `retest-after-submit.png`; console CORS error captured in test log; `emulator.log` (functions load timeout).

### Test 11 — Refresh, revisit, back/forward, sign-out, duplicate-vote prevention
**Status:** PARTIAL
**Objective:** Verify navigation, sign-out, and duplicate-vote blocking.
**Steps Performed:**
1. After a submitted/duplicate attempt, attempted re-identification with an already-used voter.
2. Exercised Continue (retry) after rejection and browser back navigation.
**Expected Result:** Duplicate voters blocked; retry and back navigation behave sanely.
**Actual Result:** Re-identifying a voter who had previously reached a ballot was rejected with the duplicate/registration message (see Test 12). The rejection screen's "Continue" returned to a clean form. Browser back from the rejection landed on the form. Full refresh/forward and sign-out-after-success could not be exercised because no successful submission was possible (Test 10 blocks this).
**Severity:** MEDIUM
**Impact:** Duplicate-vote prevention wording exists and retry works; the full post-submit revisit/sign-out path is untestable until submission succeeds.
**Reproduction Steps:** N/A
**Evidence:** `retest-closed-rejection.png`

### Test 12 — Closed-voting behavior
**Status:** PASS
**Objective:** Verify behavior after the election is closed (registration off).
**Steps Performed:**
1. Submitted fresh, never-used voter details after the election was set to closed.
2. Captured the message and the retry control.
**Expected Result:** Clear rejection message and a working retry path.
**Actual Result:** Shown: "We couldn't complete this. That email or student ID may already have been used to vote, or registration may be closed. Please double-check your details, or sign in if you already have an account." with a "Continue" button that returns to the form. No confusing stack trace or raw error.
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** Set election closed → submit fresh voter.
**Evidence:** `retest-closed-rejection.png`, `retest-closed-voting.png`

### Test 13 — Navigation and unexpected user actions
**Status:** PARTIAL
**Objective:** Verify sign-out and browser history behavior.
**Steps Performed:**
1. Used the review "Back to ballot" control (works, Test 9).
2. After closed-state rejection, clicked "Continue" and used browser back.
**Expected Result:** Sanely returns to the ballot or the form.
**Actual Result:** All observed navigation returned to a consistent, usable state (ballot or clean form). The "Sign out" control on the ballot was present but the post-sign-out redirect could not be verified end-to-end because the open-state ballot run ended before a clean sign-out was captured.
**Severity:** LOW
**Impact:** Minor unverified path.
**Reproduction Steps:** N/A
**Evidence:** `retest-review-screen.png`

### Test 14 — Responsive layout at 320x667, 375x667, 412x800
**Status:** PASS
**Objective:** Check horizontal overflow and control visibility at the three requested widths.
**Steps Performed:**
1. Loaded the page at 320x667, 375x667, and 412x800.
2. Measured `scrollWidth - clientWidth` (document + body) and visibility of the form and Continue control.
**Expected Result:** No horizontal overflow; form and submit control fully visible.
**Actual Result:** At all three widths: `overflowX=0` (document and body), form visible, Continue visible. No clipping detected.
**Severity:** N/A
**Impact:** None
**Reproduction Steps:** Load at each width.
**Evidence:** `retest-responsive-320x667.png`, `retest-responsive-375x667.png`, `retest-responsive-412x800.png`

## Bugs Found

### BUG-RET1-001 — Ballot submission is blocked: submitBallot unavailable (CORS / function not deployed)
**Severity:** CRITICAL
**Area:** Final ballot submission (Cloud Function `submitBallot`)
**Description:** After selecting candidates and confirming via "Submit final vote", the request to the functions emulator fails. The browser blocks the fetch (no `Access-Control-Allow-Origin` on the preflight), and the functions emulator has no valid functions loaded — `submitBallot` returns 404 "Function us-central1-submitBallot does not exist, valid functions are: ". The functions emulator startup log records `Failed to load function definition from source: FirebaseError: User code failed to load. Cannot determine backend specification. Timeout after 10000`. No confirmation screen is ever shown; the voter is stuck on `/vote/`.
**Expected:** The ballot posts successfully and the voter sees a confirmation screen and is marked as voted.
**Actual:** Submit request fails (CORS/404), no confirmation, vote not recorded.
**Steps to Reproduce:**
1. Load `http://localhost:3000/`, identify a valid fresh voter.
2. Select any candidate(s), open "Review ballot →".
3. Click "Submit final vote".
4. Observe the console CORS error against `…/us-central1/submitBallot` and no confirmation.
**Evidence:** `retest-after-submit.png`; console error captured in test log; `emulator.log`.
**Blocks Voting:** YES

### BUG-RET1-002 — Inconclusive duplicate-vote wording (follows from closed state, LOW)
**Severity:** LOW
**Area:** Identification error message
**Description:** The closed-state rejection message conflates two causes: "already have been used to vote, or registration may be closed." Because the election was closed during the duplicate test, it was not possible to distinguish duplicate-prevention from closed-registration messaging with one rejection copy. This is informational; no app change is inferred.
**Expected:** N/A (observation note)
**Actual:** Ambiguous single message covers both cases.
**Steps to Reproduce:** N/A
**Evidence:** `retest-closed-rejection.png`
**Blocks Voting:** NO

## Passed Tests
- Test 1 — Initial load and election state
- Test 2 — Empty form submission
- Test 3 — Invalid email / student ID
- Test 4 — Year/section dependency and section options
- Test 5 — Valid voter identification (election-open state)
- Test 6 — Ballot loading completion
- Test 7 — Position coverage and optional selections
- Test 8 — Candidate selection and changing a selection
- Test 9 — Review screen and blank-race behavior
- Test 12 — Closed-voting behavior
- Test 14 — Responsive layout at 320x667 / 375x667 / 412x800

## Blocked Tests
- Test 6 — Timeout/error/retry ballot-load path (no failure induced; marked NOT OBSERVED rather than PASS)
- Test 10 — Full submission → confirmation (FAIL due to BUG-RET1-001)
- Test 11 — Refresh/revisit/back/forward and sign-out after a successful submission (unreachable while submission is broken; PARTIAL)
- Test 13 — Sign-out redirect end-to-end (PARTIAL)

## Overall Assessment
The student/voter entry and ballot-composition flow is in good shape: validation is correct and specific, year→section dependency works, the ballot loads with all 19 optional races, selection/changing works with mutual exclusivity, the review screen behaves, closed-voting rejection is clean, and there is no horizontal overflow at any requested viewport. One CRITICAL issue blocks the voter journey from completing: ballot submission cannot reach the backend (`submitBallot` is not available in the running functions emulator, causing the CORS/404 failure). Until submission succeeds, the confirmation, post-submit duplicate-prevention, refresh, and sign-out paths cannot be fully verified.

## Recommendations
1. Restart/deploy the functions emulator so `submitBallot` loads successfully (resolve the functions load timeout), then re-run Test 10 and the post-submit duplicate/refresh/sign-out checks.
2. After submission works, verify the confirmation screen and that a second attempt by the same voter is rejected with clear duplicate wording.
3. Consider splitting the closed-vs-duplicate rejection message into distinct cases so testers/operators can distinguish "already voted" from "registration closed".
4. Re-verify responsive layout on the ballot screen itself (not only the entry form) at the three viewports once submission is unblocked.

## Testing Completion
**Status:** COMPLETE
**Final Notes:** Independent black-box student/voter retest COMPLETE against `http://localhost:3000/`. No application source, configuration, CSS, backend, database, or tests were modified; only this report and the PNG evidence under `testing-reports/` were created. Election state changed to closed mid-session by the parallel admin retest; open-state behavior was captured before that change and closed-state behavior after. The single CRITICAL finding (submission blocked, BUG-RET1-001) requires the functions emulator to be brought up successfully before the flow can be marked regression-clean.