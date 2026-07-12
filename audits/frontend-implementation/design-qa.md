# Frontend Implementation QA

Date: 2026-07-06

## Scope

- Implemented the real frontend from the mockup direction.
- Excluded `mockups/project-flowchart.html`.
- Kept Firebase auth, admin data loading, ballot submission, and route guards intact.

## Checks Run

- `npm run build` in `voting-app` passed after the latest mockup implementation pass.
- Playwright smoke screenshots were captured in this folder:
  - `home-desktop.png`
  - `home-mobile.png`
  - `home-redesign-latest.png`
  - `home-redesign-mobile-latest.png`
  - `home-console-hero-latest.png`
  - `home-console-process-latest.png`
  - `home-console-mobile-latest.png`
  - `home-custom-select-open.png`
  - `home-one-time-section-select-open.png`
  - `admin-denied-desktop.png`
  - `vote-redirect-mobile.png`
  - `not-found-desktop.png`
  - `results-desktop.png`
  - `results-mobile.png`
- Smoke report: `smoke-report.json`

## Notes

- `/admin` and `/vote` authenticated internals could not be fully interacted with during smoke testing because no authenticated Firebase session was available.
- `/admin` denied state and `/vote` unauthenticated redirect were verified.
- `/results` route shell, offline/error fallback, and mobile/desktop layout were verified. The live tally state needs a reachable Firestore published tally to fully exercise.
- No horizontal overflow was detected in the checked desktop/mobile viewports.
- After the user reported the landing still looked old, the home route was restructured to match `mockups/console-redesign.html` more directly: notice bar, terminal brand, hero copy, `Access your ballot` panel, About section, vertical process timeline, stat strip after Process, position list, eligibility, dates, FAQ, and CTA band.
- Latest homepage screenshots have no console errors and no horizontal overflow.
- The auth card now uses the mockup-style custom select-option popover for year level instead of native `<select>` controls. Verified with `home-custom-select-open.png`: menu opens, four year options render, no native selects remain in the auth card, and no overflow is detected.
- The One-time vote pane now includes the mockup's dependent custom selectors: select Year level first, then Section unlocks with generated options like `BSCS 2-A` through `BSCS 2-D`. Verified with `home-one-time-section-select-open.png`.
- The top announcement/notice strip was removed from the live landing route so the app starts directly with the console navigation and hero.
- Missing mockup routes were added to the real Next app:
  - `/dashboard` for authenticated student voters, with overview, profile, history, ballot, results, and sign-out paths.
  - `/superadmin` for super admin accounts, guarded by a `superadmin` claim and shown as locked/read-only until secure backend functions exist.
- Auth redirect behavior now sends regular voter profiles to `/dashboard`; one-time voters still go directly to `/vote`.
- Latest build route table includes `/`, `/admin`, `/dashboard`, `/results`, `/superadmin`, and `/vote`.
- Additional mockup content pass applied:
  - `loading-states.html` boot/loading language and animated terminal treatment were applied to the app loading route.
  - `notfound-redesign.html` 404 copy, terminal mark, route reference, and dashboard/sign-in actions were applied.
  - `ballot-redesign.html` structure was applied to the real ballot: verified-voter intro, fact strip, ballot map, named race sections, square candidate imagery, progress FAB, mobile sticky progress bar, and review bottom sheet.
  - `results-redesign.html` terminal nav and official-results hero language were applied while keeping turnout/date values sourced from published Firestore tally data.
- `npm run build` passed after the mockup content pass.
- Dev server was restarted cleanly on `http://localhost:3000`; curl smoke checks confirmed no notice text on `/`, updated results content on `/results`, updated 404 copy on an unknown route, and unauthenticated `/vote` redirect behavior.
- Follow-up fidelity fix after user review:
  - Restored missing `console-redesign.html` landing content to the real home route: four About feature blocks, exact position abbreviations/year-rep labels, SEC-01 through SEC-06 integrity labels, key date copy, expanded FAQ questions, and CTA wording.
  - Replaced the auth card custom select dropdown with a modal-style selector for Register year, One-time year, and One-time section so options no longer clip inside the auth card.
  - `npm run build` passed after these fixes.
  - Dev server was restarted cleanly again on `http://localhost:3000`; curl confirmed the restored public-page content is present and `NOTICE` is still absent.
- Auth-only correction after user review:
  - Re-copied the auth card structure to match `console-redesign.html`: `switch` tab control with sliding indicator, `pane` form sections, `field` wrappers, and `cselect` option controls.
  - Removed the centered selector modal behavior and restored a fixed popover listbox like the mockup, while keeping real Firebase auth handlers wired.
  - `npm run build` passed.
  - Playwright smoke confirmed the One-time year select opens a visible `.cselect-menu` with `1st Year`, `2nd Year`, `3rd Year`, and `4th Year`.
- Playwright reported Firestore connectivity errors for `/results` in this environment; the page stayed within its designed fallback state.
- `npm run lint` currently prompts to create a Next ESLint config, so lint was not run to completion.

Final result: passed for public routes, guard states, build, and responsive layout. Authenticated admin/ballot data states remain credential-gated.
