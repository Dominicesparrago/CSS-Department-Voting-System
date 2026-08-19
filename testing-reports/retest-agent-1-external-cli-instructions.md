# External CLI Retest Instructions — Student/Voter

You are an independent black-box regression tester for the CSS Department Voting System.

## Rules

- Test only through the visible application and normal browser/UI interactions.
- Do not inspect source code to decide whether behavior works.
- Do not modify application source, configuration, CSS, backend, database, or tests.
- You may write only your report and evidence files under `testing-reports/`.
- Reproduce every failure before reporting it.
- Do not expose credentials, tokens, or private student data in screenshots/reports.

## Application

- Workspace: `C:\Users\Dominic\Desktop\Cursor\CSS Department Voting System\CSS-Department-Voting-System`
- Test the currently running local app. Try `http://localhost:3000/`; if unavailable, use the active local URL supplied by the operator, such as `http://localhost:3100/`.
- Record the exact URL, browser, viewport, and date in the report.

## Test scope

Test the complete student journey:

1. Initial page load and visible election state.
2. Empty form submission.
3. Invalid email, student ID, name, year, and section.
4. Year/section dependency and all available section options.
5. Valid voter identification.
6. Ballot loading: completion, timeout, visible errors, and retry behavior.
7. Every available position and whether candidate selection is required or optional.
8. Candidate selection and changing a selection.
9. Review screen and blank-race behavior.
10. Final submission and confirmation.
11. Refresh, revisit, back/forward, sign-out, and duplicate-vote prevention.
12. Closed-voting behavior if the test environment permits it.
13. Navigation and unexpected user actions.
14. Responsive layout at 320x667, 375x667, and 412x800. Check horizontal overflow, clipped controls, long headings, candidate cards, and bottom actions.

## Report output

Write the final report to:

`testing-reports/retest-agent-1-student-report.md`

Use this structure:

```md
# Voting System Retest Report

## Agent Information
- Agent: External CLI Retest Agent 1
- Testing Role: Student/Voter Black-Box Regression
- Date:
- Testing Status:

## Testing Environment
- Application URL:
- Browser:
- Device/Viewport:
- Other relevant information:

## Testing Progress
### Test 1 — [Name]
**Status:** PASS / FAIL / BLOCKED
**Objective:**
**Steps Performed:**
1. ...
**Expected Result:**
**Actual Result:**
**Severity:** CRITICAL / HIGH / MEDIUM / LOW
**Impact:**
**Reproduction Steps:**
1. ...
**Evidence:**
...

## Bugs Found
### BUG-RET1-001 — [Title]
**Severity:**
**Area:**
**Description:**
**Expected:**
**Actual:**
**Steps to Reproduce:**
1. ...
**Evidence:**
**Blocks Voting:** YES / NO

## Passed Tests
- ...

## Blocked Tests
- ...

## Overall Assessment
...

## Recommendations
1. ...

## Testing Completion
**Status:** COMPLETE
**Final Notes:**
...
```

Do not stop after the first failure. If the browser or server prevents a test, mark it BLOCKED and explain the exact reason. Finish only when all reasonable tests are documented and the report ends with `**Status:** COMPLETE`.
