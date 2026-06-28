# Phase 6 Hardening Report

## Anti-Cheating Sweep

The following scenarios are covered by emulator tests and current implementation:

| Scenario | Enforcement | Verification |
|---|---|---|
| One vote per position | Deterministic vote ID `${electionId}__${uid}__${positionId}` plus create-only `votes` and `!exists` check | `phase3.vote.test.js` second submit rejected |
| No voting when election is not open | `electionOpen(electionId)` in Firestore rules | `phase3.vote.test.js` draft election vote rejected |
| Cross-year Year Rep rejected | Hardcoded year-rep mapping in `positionAllowedForVoter` | `phase3.vote.test.js` wrong-year rep rejected |
| Ineligible voter rejected | `voterIsEligible(uid)` rule guard | `firestore.rules.test.js` and Phase 6 sweep command |
| Duplicate studentNo rejected | `studentIndex/{studentNo}` create-only uniqueness and `getAfter(voters/{uid}).studentNo == studentNo` | `phase2.auth.test.js` and `phase5_admin_app_test.py` |
| Votes immutable | No update/delete allowed on `votes/{voteId}` | `firestore.rules.test.js` |
| Non-admin blocked from candidates/voters/tallies/votes | Collection allow matrix and admin custom claim checks | `phase4.admin.test.js` |
| Client cannot write tallies | `tallies` create/update/delete admin-only | `firestore.rules.test.js` and `phase4.admin.test.js` |

## Mobile And Accessibility QA

- Login/register controls have visible labels and inputs with `min-height: 46px`.
- Student ballot buttons have `min-height: 46px`; candidate cards have `min-height: 72px`.
- Candidate card labels wrap the hidden radio input for radio semantics and touch selection.
- The binary rain canvas is `aria-hidden` and disabled when `prefers-reduced-motion: reduce`.
- There is no custom cursor implementation in the app CSS/JS; touch devices use normal browser behavior.
- Text uses light foreground on dark surfaces with teal accents; error text uses `--danger`.
- Base layout is mobile-first and tested at 360px width in Playwright.

## Production Access-Budget Smoke Test

Status: REQUIRED BEFORE GO-LIVE, not executed by Codex.

Reason: the test must write a real 17-vote batch to production Firestore rules. The Phase 6 instruction explicitly says to stop before production data writes unless the user gives explicit go-ahead.

Runnable checklist: see `docs/deploy-runbook.md`.
