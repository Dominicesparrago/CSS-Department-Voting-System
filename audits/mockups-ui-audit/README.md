# Mockups UI Audit

Date: 2026-07-06

Scope: `mockups/*.html` and `mockups/components/custom-select.html`.

Evidence: screenshots saved in `audits/mockups-ui-audit/screenshots/`.

## Steps Reviewed

1. `01-ballot.png` / `09-mobile-ballot.png` - Ballot screen. Health: needs critical changes.
2. `02-dashboard.png` / `10-mobile-dashboard.png` - Voter dashboard. Health: usable, but not production-ready.
3. `03-admin.png` / `13-admin-settled.png` / `11-mobile-admin.png` - Admin overview. Health: visually strong, but has production polish/accessibility risks.
4. `04-console.png` / `12-mobile-console.png` / `console-scroll-*.png` - Landing and sign-in console. Health: strong concept, but content/reveal behavior needs cleanup.
5. `05-superadmin.png` - Superadmin access control. Health: usable, but risky destructive actions.
6. `06-results.png` / `results-scroll-*.png` - Published results. Health: incomplete for promised election scope.
7. `07-loading-states.png` - Loading/state launcher. Health: useful inventory, but actual state flows need verification.
8. `08-notfound.png` - 404 page. Health: good.

## Critical Issues

1. Ballot only contains 5 races while the UI promises 17.
   - Evidence: `01-ballot.png`, `09-mobile-ballot.png`, and `mockups/ballot-redesign.html`.
   - The page copy says "17 races in all", but the rendered ballot shows President, VP Internal, Secretary, Treasurer, and 1st Year Representative only. The floating progress badge also says `0 / 5 races selected`.
   - Impact: voters cannot complete the real election. This must be fixed before implementation or user testing.
   - Recommended change: define all required races, or change the copy and progress model if this mockup is intentionally scoped. For production, the ballot should be generated from election configuration, not hardcoded mock arrays.

2. Results mockup does not cover the same election scope as the ballot/landing copy.
   - Evidence: `06-results.png`, `results-scroll-1.png`, `results-scroll-2.png`, and `mockups/results-redesign.html`.
   - The app says there are 20 positions / 17 races, but results data only covers 8 result groups.
   - Impact: published results would look incomplete and could reduce trust in the election.
   - Recommended change: results should either show every race or clearly disclose that it is a partial preview/mock sample.

3. Visible sample/developer labels are shown to users.
   - Evidence: `02-dashboard.png`, `03-admin.png`, `05-superadmin.png`, `06-results.png`, `10-mobile-dashboard.png`, `11-mobile-admin.png`, and `12-mobile-console.png`.
   - Examples include visible strings like `// sample`, `sample v2`, and "Landing redesign".
   - Impact: this makes the UI feel unfinished and can undermine trust in an election system.
   - Recommended change: remove all mockup/debug labels from production screens. Keep design notes in comments or docs, not visible UI.

## High Priority

4. Ballot progress button overlaps content on mobile.
   - Evidence: `09-mobile-ballot.png`.
   - The circular progress button sits over the first candidate image area.
   - Recommended change: on mobile, use a bottom sticky bar or reduce/move the floating button so it never covers candidate content.

5. Landing page depends heavily on scroll-triggered reveal.
   - Evidence: `04-console.png` shows offscreen content hidden in full-page capture; `console-scroll-*.png` shows it appears when scrolled.
   - Impact: users with script failures, screenshot/print flows, or reduced browser support may see large blank areas. It also makes automated QA harder.
   - Recommended change: make content visible by default and animate enhancement only after load. Avoid opacity-zero content as the baseline state.

6. Superadmin destructive actions are too easy to trigger.
   - Evidence: `05-superadmin.png`.
   - `Make super` and `Revoke` actions sit inline with no visible confirmation, reason capture, or audit context.
   - Recommended change: require confirmation for revoke/escalation, show role consequences, and capture an audit reason.

## Medium Priority

7. Animated binary-rain background competes with body text.
   - Evidence: admin, dashboard, console scrolled screenshots, results screenshots.
   - Impact: lowers readability, especially for long policy/integrity copy and results tables.
   - Recommended change: reduce opacity further behind text, pause under content panels, or disable on dense/admin pages.

8. Many labels use tiny mono uppercase text.
   - Evidence: all desktop and mobile screenshots.
   - Impact: weak readability on mobile and possible contrast/legibility issues.
   - Recommended change: keep mono style for short metadata only; increase size/contrast for status, dates, and labels.

9. Loading/state screen is only a launcher.
   - Evidence: `07-loading-states.png`.
   - Impact: the audit cannot verify the actual opening, proceeding, success, blocked, and denied states from the index screenshot alone.
   - Recommended change: capture or implement each state as a real route/modal with recovery actions, focus handling, and screen-reader announcements.

10. Count-up animations can show misleading intermediate metrics.
    - Evidence: `03-admin.png` captured early during count-up; `13-admin-settled.png` shows final values.
    - Impact: if the animation is slow or interrupted, admins may briefly see incorrect totals.
    - Recommended change: keep animation very short, respect reduced motion, and avoid animating critical election numbers from `0` if accuracy is more important than flair.

## Accessibility Risks

- Screenshot-only audit cannot confirm keyboard focus order, screen-reader labels, form validation, or modal focus trapping.
- Candidate cards behave visually like radios; ensure each race is a proper radiogroup with clear keyboard navigation and error messaging.
- Admin and superadmin drawers need focus trapping, Escape close, and visible focus states.
- Motion-heavy elements should respect `prefers-reduced-motion`; several mockups appear to check it, but this still needs browser testing.
- Color contrast should be tested with tooling, especially muted gray text on the dark teal background.

## What Looks Strong

- The visual system is coherent: dark election-console style, strong teal identity, and consistent cards/buttons.
- The voter dashboard has a clear primary action: "Go to your ballot".
- The 404 page is polished and gives two recovery paths.
- The ballot candidate cards include platform text and details, which is good for voter confidence.

## Suggested Fix Order

1. Make ballot and results data complete and consistent with 17 races / 20 positions.
2. Remove visible sample/debug labels from every screen.
3. Fix mobile ballot progress overlap.
4. Add confirmation and audit reason flows for superadmin role changes.
5. Reduce background motion/noise on reading-heavy screens.
6. Verify keyboard, screen-reader, contrast, and reduced-motion behavior in the implemented app.
