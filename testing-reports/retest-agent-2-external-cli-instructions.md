# External CLI Retest Instructions — Admin/System

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
- Test the currently running local app. Try `http://localhost:3100/admin/`; if unavailable, use the active local URL supplied by the operator, such as `http://localhost:3000/admin/`.
- Record the exact URL, browser, viewport, and date in the report.

## Test scope

Test the complete administrator/system journey:

1. Admin login, logout, and login persistence.
2. Dashboard statistics and visible loading/error states.
3. Lifecycle: confirm the dialog, then test Registration OPEN -> CLOSED, Voting OPEN -> CLOSED, and Publish when prerequisites exist. Verify status text, visible success/error feedback, audit entry, refresh persistence, and public-page synchronization.
4. Candidate add, edit, remove, confirmation dialogs, roster refresh, and persistence.
5. Voter list, search/status filters, empty state, and CSV export. If there are zero records, verify either a valid header-only CSV download or a clear visible no-data explanation.
6. Results loading, refresh, position filtering, all-position behavior, candidate counts, winner determination, and zero-data behavior.
7. Candidate/winner graphs and graph exports, including transparent/backgroundless and white-background variants, PNG dimensions, alignment, labels, and visible-vs-exported consistency where available.
8. Cross-system checks: admin OPEN means public voting is open; admin CLOSED prevents voting; submitted votes update turnout/results; published results appear publicly.
9. Browser refresh/back/forward and visible error states. Console/network errors may support a finding but do not replace visible behavior testing.

## Important interaction detail

For destructive or lifecycle actions, click the initial action, wait for the confirmation dialog, and click the dialog’s final confirm button. Capture evidence after the dialog closes. A screenshot showing the confirmation dialog still open is not proof that the action failed.

## Report output

Write the final report to:

`testing-reports/retest-agent-2-admin-report.md`

Use this structure:

```md
# Voting System Retest Report

## Agent Information
- Agent: External CLI Retest Agent 2
- Testing Role: Admin/System/Results Black-Box Regression
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
### BUG-RET2-001 — [Title]
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

Do not stop after the first failure. If the browser, credentials, server, emulator, or missing test data prevents a test, mark it BLOCKED and explain the exact reason. Finish only when all reasonable tests are documented and the report ends with `**Status:** COMPLETE`.
