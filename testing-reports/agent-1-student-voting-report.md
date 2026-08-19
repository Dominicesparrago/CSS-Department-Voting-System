# Agent 1 — Student/Voter Black-Box Test Report

Date: 2026-08-16  
Role: Normal student/voter only  
Application: `http://localhost:3000/`  
Evidence: [initial form](evidence-agent-1-initial.png), [voting/loading state](evidence-agent-1-loading.png), [confirmation](evidence-agent-1-confirmation.png)

## Scope and test data

Testing was performed through visible browser/UI interactions only. No application source, configuration, database, backend, or CSS was changed. The test voter used non-secret test data: `Test Student`, `juan.delacruz.scc@gmail.com`, student ID `20261234`, `1st Year`, `BSCS-1A`.

## Test results

| ID | Test | Result | Observed behavior |
|---|---|---|---|
| ST-01 | Initial load and page identity | PASS | One-time voter form loaded with Full Name, Student Email, Student ID, Year level, Section, and Continue. |
| ST-02 | Empty submission | PASS | Continue displayed required validation for name, official email, student ID, year level, and section. |
| ST-03 | Invalid email and student ID | PASS | `not-an-email` showed “Use your official <name>.scc@gmail.com email.” and `12` showed “Student ID must be 7 to 9 digits.” |
| ST-04 | Year/section dependency | PASS | Section was disabled until year level was selected; selecting 1st Year exposed BSCS-1A through BSCS-1J. |
| ST-05 | Valid identification and ballot open state | PASS | Valid details redirected to `/vote/`; ballot eventually loaded. |
| ST-06 | Ballot positions and required choices | PASS with data limitation | The ballot displayed 19 races. Every race was marked Optional. Only Internal - VP had an active candidate in this test state; the other 18 displayed “No active candidates are available for this race yet.” |
| ST-07 | Candidate selection | PASS | Mark Arañes for Internal - VP could be selected and the counter changed to 1 / 19. |
| ST-08 | Review flow | PASS | Review dialog listed all 19 races, showed the selected candidate, identified 18 blank races, and stated submission is final. |
| ST-09 | Submit and confirmation | PASS | “Your vote is recorded” appeared and stated the ballot was counted exactly once. |
| ST-10 | Refresh/revisit after submission | PASS | Reopening `/vote/` showed “You’ve already voted.” and “Each student may vote once.” |
| ST-11 | Sign out and resubmit same voter | PASS | After sign out, re-entering the same voter details was rejected with a visible message indicating the email or ID may already have been used. |
| ST-12 | Back/forward and unexpected navigation | PASS with limitation | Direct `/results` navigation was reachable and showed “Results Locked / Not published yet.” Browser back from the test page reached the browser’s blank prior page; forward returned to the app and eventually showed the already-voted state. No new vote was exposed. |
| ST-13 | Responsive layout at 375px viewport | FAIL | Ballot loaded at a narrow viewport, but the candidate card bounding width extended beyond the main 360px content area (card at x=28 with width 341, ending at x=369). Long race headings also wrapped heavily, making the page very tall and indicating horizontal overflow risk. |
| ST-14 | Closed voting state | BLOCKED | No student-facing control or normal voter action was available to close the election. The tested election remained open; the results page was locked because results were not published, which is not equivalent to closed voting. |

## Bugs Found

### BUG-001 — Prolonged indeterminate loading after valid voter identification

- Severity: Medium
- Reproduction: From the initial form, submit valid voter details and wait on `/vote/`.
- Expected: Ballot becomes available promptly or a clear actionable error/timeout is shown.
- Actual: “CSS Voting is loading” remained visible for more than 25 seconds with `loading` and `secure` status labels. The ballot eventually appeared only after roughly 40–50 seconds, with no progress explanation or retry action.
- Impact: A student may assume the vote failed or abandon the process.
- Evidence: [loading screenshot](evidence-agent-1-loading.png).

### BUG-002 — Narrow viewport candidate card extends beyond content width

- Severity: Medium
- Reproduction: Open the ballot and resize the browser to 375 × 667 CSS pixels.
- Expected: All ballot cards fit the viewport without horizontal overflow.
- Actual: The Internal - VP candidate card extended past the 360px page content width; long position headings wrapped into multiple lines and produced a 6,000px+ page. This creates a poor mobile voting experience and may make controls difficult to reach.

### BUG-003 — Duplicate-voter error is ambiguous

- Severity: Low/Medium
- Reproduction: Sign out after submitting, then enter the same student details and press Continue.
- Expected: A precise message that this student has already voted, with clear next action.
- Actual: The message said: “That email or student ID may already have been used to vote, or registration may be closed...”. It correctly blocked access but conflated duplicate voting with closed registration and account sign-in.

## Passed Tests

- Initial voter form and visible labels loaded.
- Empty and invalid input validation appeared without submission.
- Section remained unavailable until year level selection.
- Valid voter details opened the ballot.
- Candidate selection, progress count, review dialog, and final confirmation worked.
- Confirmation explicitly stated the vote was counted exactly once.
- Refresh/revisit and sign-out/resubmit prevented a duplicate vote.
- Direct results navigation showed a locked/not-published state.

## Blocked Tests

- Closed voting could not be tested from a student/voter perspective because the election state could not be changed through the user-facing application. No attempt was made to modify admin state, backend data, or configuration.
- Complete “every available position and required candidate choice” coverage was limited by the observed election data: 18 races had no active candidates and all 19 races were visibly optional.

## Overall Assessment

The normal voter journey is functionally usable once the ballot finishes loading: validation, ballot review, submission confirmation, and one-time duplicate prevention all worked. The main student-facing risks are the long unexplained post-identification loading period, mobile-width overflow/very tall layout, and ambiguous duplicate/closed-state messaging. The tested election data also appeared incomplete because only one of 19 races had an active candidate.

## Recommendations

1. Add a bounded loading timeout with progress, retry, and actionable error messaging.
2. Constrain candidate cards and long headings to the viewport at narrow widths; test at 320px, 375px, and 412px.
3. Replace the duplicate message with a specific already-voted result when that condition is known.
4. Ensure election configuration exposes the intended active candidates before release, or clearly explain vacant/no-candidate races.
5. Run a coordinated closed-election test using the approved voter-facing test environment.

**Status:** COMPLETE
Final Notes: Student/voter black-box testing is COMPLETE. The assigned report and evidence files were written under `testing-reports/`; no application fixes were made.
