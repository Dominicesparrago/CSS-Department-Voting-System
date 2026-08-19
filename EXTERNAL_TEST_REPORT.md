# External Black-Box Audit — /admin (Admin Console)

**Date:** 2026-08-16
**Mode:** External black-box testing (no source inspection / no source modification during testing)
**Target:** `http://localhost:3000/admin` (Next.js dev server, LIVE Firebase project `css-department-voting-sy-f46a5`, emulators not running)
**Test account:** `admin-test@scc.com` / `admintest123` (provided by owner)
**Harness:** Playwright (Chromium 1.62.1) — scripts under `C:\Users\Dominic\AppData\Local\Temp\opencode\admin-*.mjs`

---

## 1. Font Audit

### Findings
| Route | Computed body font-family | Bundled Figtree webfont applied? |
|---|---|---|
| `/` (landing) | `__figtree_3e92d1, __figtree_Fallback_3e92d1, Figtree, ...` | Yes |
| `/admin/auth` (login) | `__figtree_3e92d1, __figtree_Fallback_3e92d1, Figtree, ...` | Yes |
| `/admin` (console) | `Figtree, Figtree, "Segoe UI", Arial, sans-serif` | **No** |

- **Observation:** The admin console (`/admin`) resolves the body font to the plain name `Figtree` with **0 elements using the `__figtree_3e92d1` token**, unlike the landing page and login page which use the bundled next/font token.
- Canvas-width probe (`document.fonts.load` / measureText): bundled token `__figtree_3e92d1` = **485.3px** vs plain `Figtree` = **452.8px** vs `Segoe UI` = **478.1px** for the same test string — i.e., the console is NOT rendering with the bundled webfont.
- **Hypothesis (not verified by source):** the admin console shell does not apply the same localFont override hook that the landing/login forms use, so on machines without Figtree installed it falls back to Segoe UI.
- **Severity:** Medium (visual inconsistency across the admin flow; affects any client lacking system Figtree).

### Verified working (fonts)
- Login page loads **both** Figtree and JetBrains Mono via the `@font-face`/token mechanism and applies them to the body. No font loading errors in console.

---

## 2. Authentication & Access Control

| Test | Result |
|---|---|
| Correct credentials → login | Redirects to `/admin`; console renders |
| Wrong password | Inline message "Email or password is incorrect." |
| Malformed email | "Something went wrong…" toast/message (no crash) |
| Blank email + password | "Email and password are required." |
| Sign out | Returns to `/admin/auth` |
| Direct `/admin` after sign-out | Redirects to `/admin/auth` (console NOT rendered) |
| Form submit behavior | React-hydrated (`preventDefault`), never a native GET submit; no password in URL |

All pass.

---

## 3. Feature / Panel Audit

### Overview
- Live snapshot, turnout stats, registered/ballots/candidates render.
- **Position selector** lists 22 positions across Executive / Committees / Year Representatives groups.
- **Export CSV** works (downloads `css-results-css_department_election_2026.csv`).
- **"+ Add candidate"** quick action navigates to the Candidates panel (active state correct).
- **BUG (High): percentage/ratio display.** For "2. Internal - VP" with candidate Mark Arañes (1 vote):
  - Overview shows **"150% of total turnout"** and winner **"1100%"** and **"2 TOTAL VOTES"**.
  - Results panel for the same position shows **1 vote, 100%**.
  - President position shows "2 TOTAL VOTES" with "No candidates available" (ballots exist, no candidates for that race — inconsistent summary numbers vs the tally).

### Candidates
- **Add candidate** works: name + platform required (HTML `required` blocks empty submit — note: no visible inline error message on empty save, just blocked submit).
- **Edit** populates the name field.
- **Remove** works with confirmation dialog.
- Roster count / "OF N SHOWN" indicator works.
- Test candidates created during audit were removed; roster restored to 1 shown.

### Voters
- Filters work: All (11 rows), Voted (2), Not-yet-voted (9).
- **Search** filters rows (e.g. "Mark Logan" hides other voters).
- **Export CSV** works (`css-voters-pending-css_department_election_2026.csv`, header `fullName,studentNo,email,yearLevel,section,eligible,status`, 11 rows).

### Results
- **Download JSON** works (`css-results-css_department_election_2026.json`) with keys `perCandidate`, `perPosition`, `turnout` (total + byYear).
- **Refresh** works.
- **Position selector** works (switches displayed race and tally; earlier test showed "1. President" persisting only when the wrong DOM node was clicked — retested via `role="option"` and selection updates correctly).
- Privacy banner present ("no individual ballot is ever read").

### Lifecycle
- **Close polls** shows a confirmation dialog ("Close the polls?…" Cancel/Close polls) — canceled, state unchanged.
- **Publish results** is `disabled` while polls are open (expected).
- **Close registration** executes **immediately with NO confirmation dialog** — the audit actually closed registration in the live state, then reopened it via "Open registration" (also no dialog). State was restored: registration OPEN, voting OPEN.
- **FINDING (Medium):** Close registration / Open registration perform a state-changing action with no confirmation, inconsistent with the Close-polls flow which requires confirmation. Risk of accidental click.

---

## 4. Console / Network Errors

- **One `REQFAIL` on the Firestore Listen channel (`net::ERR_ABORTED`)** on initial load of `/admin` (transient; not reproducible on every run).
- One run (audit8) captured **three HTTP 400 resource errors** during add-candidate; not reproduced in subsequent runs — flaky, likely dev-server artifact. No errors during add/remove on retest.

---

## 5. Summary

| Area | Verdict |
|---|---|
| Auth & access control | PASS |
| Fonts on login/landing | PASS |
| Fonts on console (`/admin`) | **FAIL** — bundled Figtree webfont not applied |
| Overview percentages | **FAIL** — 150% / 1100% / "2 TOTAL VOTES" vs Results 100% / 1 vote |
| Registration close/open confirmation | **FAIL** — no confirmation dialog (inconsistent with Close polls) |
| Candidates add/edit/remove | PASS |
| Voters filters/search/export | PASS |
| Results refresh/download/selector | PASS |
| Lifecycle close-polls dialog + publish gating | PASS |

### Test-data cleanup
No test candidates remain (roster back to 1). Registration and voting both still OPEN. No test ballots were cast.