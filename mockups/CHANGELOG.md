# Overnight autonomous work — CHANGELOG

Session goal: fix UI issues (desktop + mobile), infer & apply UI preferences, improve
end-to-end flow, add missing pages. Preserve functionality; safe reversible edits only.

Verification note: no headless browser available in this env, so "verified" = served OK
(HTTP 200) + reasoned through the CSS at desktop and mobile breakpoints (320/360/390/768
+ the 960px sidebar boundary). Visual spot-check left for the morning where noted.

Preview server: `python3 mockups/_serve.py` on :8088 (no-cache headers).

---

## 2. Inferred UI preferences (old samples vs new)

Old samples: `console-redesign`, `ballot-redesign`, `admin-redesign` (v1).
New samples (and the evolved console/ballot after feedback): `dashboard-redesign`,
`results-redesign`, `superadmin-redesign`, `loading-states`.

Pattern inferred (NEW direction wins on conflict):
- **Sections over cards.** Un-boxed content in named sections separated by hairline
  dividers; the ONLY sanctioned card is the auth widget. Metric/stat groups are un-boxed
  "icon + big number + label" strips with a clean divider grid (no stray borders).
- **Sidebar navigation for dashboards.** Voter dashboard + super-admin use a left sidebar
  (sticky desktop / hamburger drawer mobile). => admin (still on top tabs) is the outlier
  to reconcile.
- **Icon-led blocks:** `[icon]  Title / description`, icon vertically centered.
- **Full-width, mobile-first**, symmetric margins, generous section rhythm.
- **Motion:** count-up, scroll reveal, step-by-step timeline w/ dwell, sliding auth
  indicator, FAB progress ring, "ballot stamp" select — all `prefers-reduced-motion` aware.
- **Type/color:** Figtree + JetBrains Mono micro-labels (eyebrows, `//` comments),
  teal glassmorphism on near-black, binary-rain backdrop, gradient-clipped headings.
- **Candidate imagery** shown prominently (avatars/photos) in ballot, results, admin graph.

Conflicts noted: old admin leans on cards (metric-card/admin-card/chart-card) — the new
direction is un-boxed. Resolving toward NEW (see admin rebuild below).

---

## Changes (per file, chronological)

### Flow (auth → dashboard → ballot → confirmation)
- `console-redesign.html`: Sign in & Register now route to **dashboard-redesign.html**
  (post-auth home) instead of jumping straight to the ballot. One-time vote still goes
  straight to the ballot (single-use, no dashboard).
- `ballot-redesign.html`: review-sheet "Submit final vote" now links to
  **loading-states.html?screen=success** (real confirmation destination) instead of a
  dead button.
- `loading-states.html`:
  - success screen actions now link out — "Back to dashboard" → dashboard,
    "View results" → results (were dead `data-exit` buttons).
  - added a **`?screen=` deep-link handler** so `loading-states.html?screen=success`
    (or proceed/open/already/notopen/closed/denied) auto-opens that screen. This is what
    makes the ballot→confirmation hop land correctly.
- Resulting coherent flow:
  landing/auth → dashboard → ballot → review → submit → **success confirmation** →
  dashboard/results. Blocked states (already-voted/closed/denied) reachable + linked.

### New page: notfound-redesign.html (404)
- Added a 404 page in the established un-boxed centered-state style (gradient "404",
  eyebrow, message, mono terminal line, actions → dashboard / sign in). Safe-area aware,
  scroll-safe, reduced-motion aware, binary-rain backdrop. Purpose: error dead-end recovery.

### admin-redesign.html (already sidebar — corrected my plan assumption)
NOTE: admin was ALREADY on the sidebar layout (not tabs), and its results graph already
shows candidate images. So the "admin sidebar + image graph" item was really about the
admin having the SAME bugs the newer pages had. Applied the identical fixes:
- Drawer-bg bug: moved column/padding/background/border/blur onto base `.sidebar` so the
  mobile drawer renders as a solid vertical panel (was transparent + row-laid-out).
- Mobile hardening: `100dvh` on sidebar/drawer, `safe-area-inset` on topbar, drawer
  `overflow-y:auto` + `min(84vw,268px)`, body scroll-lock on open.
- Metric strip: replaced staggered `.metric+.metric{border-top}` with the scoped
  nth-child cross-divider grid (no stray top-right border on mobile 2x2).
- Results/overview bars: restructured to avatar + name-row-above-slim-bar (matches
  results-redesign) so long names never clip in the track; kept "Leading" tag + %/counts.
- `min-height:100vh` on body/.shell left as-is (safe minimums, not the fixed-height bug).

### ballot-redesign.html — mobile hardening + a11y
- FAB + FAB tooltip: `safe-area-inset` on right/bottom so they clear the home indicator.
- Review sheet & candidate modal: **body scroll-lock** while open; refactored modal close
  into `closeModal()` so backdrop-click AND Escape both release the lock (was a stuck-lock
  bug on backdrop-close).
- Sheet action bar: `safe-area-inset-bottom` padding.
- Voter-facts strip: replaced staggered `.fact+.fact{border-top}` with the scoped
  nth-child cross-divider grid (removes stray mobile 2x2 border).

### loading-states.html — a11y polish
- Added `aria-label="Close screen"` to all overlay exit buttons.

### console-redesign.html — audited, no hardening needed
- Nav is non-sticky (scrolls away), no fixed/overlay elements => nothing to safe-area.
  Left as-is; already fully responsive from earlier iterations.

---

## FINAL SUMMARY (for morning review)

### DONE
- **Flow made coherent:** landing/auth → **dashboard** → ballot → review → submit →
  **success confirmation** (loading-states?screen=success) → dashboard/results. Blocked
  states (already-voted / not-open / closed / denied) merged into loading-states and
  linked. Dead buttons removed.
- **New page:** `notfound-redesign.html` (404) for error dead-ends.
- **Admin fully fixed** (it was already sidebar): drawer-bg bug, mobile hardening,
  metric-divider bug, results-bar clip — now matches the newer pages.
- **Mobile hardening across all sidebar/overlay/FAB pages:** `100dvh`, `safe-area-inset`,
  drawer solid-bg + scroll + `min(84vw,…)`, body scroll-lock on drawers/sheets/modals.
- **Consistency fixes everywhere:** every metric/stat/fact strip now uses ONE correct
  divider pattern (no stray borders); every results/vote bar uses the avatar +
  name-above-slim-bar layout (candidate image always shown, names never clip).
- **A11y:** all icon-only controls labelled; `:focus-visible`, `prefers-reduced-motion`,
  and viewport meta present on every page.
- All 8 pages serve HTTP 200 after every change.

### PAGE INVENTORY (mockups/)
console (landing+auth) · dashboard (voter, sidebar) · ballot (vote) ·
loading-states (loading/proceeding/success + blocked states, ?screen= deep-link) ·
results (student) · admin (sidebar) · superadmin (sidebar) · notfound (404).

### NOT DONE / LEFT AS TODO FOR YOU TO DECIDE
1. **Secret-ballot vs. Poll history** (dashboard History tab): showing "how you voted" for
   the *official* election conflicts with a secret ballot. Confirm: (a) history shows only
   THAT you voted for the official election, or (b) full choices kept only for casual side
   polls. Currently the sample shows choices for side polls + "not voted" for the official.
2. **Admin access path:** admins/superadmin pages are opened directly (no public link).
   Decide how admins authenticate (reuse console auth + role gate?) — intentionally not
   linked from the public flow.
3. **404 wiring:** `notfound-redesign.html` exists but is only reachable by direct URL
   (as expected for a 404). Real app would route unknown paths to it.
4. **Real candidate photos:** avatars are initials placeholders; `<img>` slots + object-fit
   are in place for when real photos are wired.
5. **Visual spot-check:** verification was CSS-reasoning + HTTP 200 (no headless browser in
   this env). Worth a quick device-mode pass on: drawer open (mobile), overlays in
   landscape, ballot FAB near the home indicator.

### VERIFY / RUN
Preview server: `python3 mockups/_serve.py` (:8088, no-cache). Open any `*-redesign.html`
or `loading-states.html`.

---

## Audit-driven fix pass — 2026-07-06 (audits/mockups-ui-audit)

Source: `audits/mockups-ui-audit/README.md` + screenshots. Priority: critical election
correctness > production readiness > mobile usability, per instructions. Verification:
no headless browser in this env — used HTTP 200 checks, `new Function()` JS-syntax
checks, HTML tag-balance/duplicate-ID scripts, and CSS/breakpoint reasoning at 1440px/390px.

### 1. Ballot completeness (critical) — `ballot-redesign.html`
- Was 5 races while copy promised 17. Expanded `RACES` to the full 17: all 16
  department-wide positions (President … Community Committee Chair) + the voter's own
  1st Year Representative race. Progress badge, sticky rail, review sheet, and selected
  count all derive from `RACES.length`, so they now read 17 automatically — no more
  copy/data mismatch.
- Reused the exact candidate names already used for ICT/Events Committee Chair so the
  ballot and results pages agree on those two races.

### 2. Results completeness (critical) — `results-redesign.html`
- Was 8 result groups; expanded `POS` to all 20 positions (7 executive + 9 committee
  chairs + 4 year reps), matching the "20 positions / 17 races" landing-page copy.
- Verified arithmetic: every executive/committee race totals exactly 173 (= ballots
  cast), and the four year-rep races sum to exactly 173 across year levels (42+44+45+42),
  since each of the 173 voters votes in exactly one year-rep race. Filters (Executive /
  Committees / Year Reps) now show a complete, internally consistent set.
- Also synced `admin-redesign.html`'s "Votes by candidate" data and its "Add candidate"
  position `<select>` to the same 20-position scope (was 4 positions / 5 dropdown options).

### 3. Visible sample/debug labels (critical) — all 8 pages
Removed every visible `// sample`, `(Sample)`, `sample v2`, `Console Redesign v2`,
`Landing redesign`, and "illustrative for this sample" string from rendered UI and
`<title>` tags (console, ballot, dashboard, admin, superadmin, results, loading-states).
Where a banner/footer note existed only to carry dev commentary, replaced it with real
copy (e.g. console's top banner now shows an actual "voting opens" notice instead of a
design-note banner) rather than just deleting the slot.

### 4. Mobile ballot progress overlap (high) — `ballot-redesign.html`
- Added a **bottom sticky progress/review bar** for ≤719px screens (small ring + "X/17
  selected" + Next/Review CTA, safe-area aware) that never sits over candidate photos.
  The circular FAB is hidden on that breakpoint and kept for ≥720px where it doesn't
  overlap. Same tap-to-jump-to-next-empty-race / tap-to-review behavior on both.

### 5. Superadmin destructive actions (high) — `superadmin-redesign.html`
- "Make super" / "Revoke" no longer act immediately. Both open a confirmation dialog with
  action-specific consequence text, a **required reason field** (≥8 chars) that gets
  written into the audit log on confirm, Escape/backdrop-click to cancel, and a basic
  focus trap. Revoke removes the admin row; Make Super promotes it — both actions are
  now traceable in the Audit log panel.

### 6. Background motion vs. readability (medium) — all pages with `#rain`
The existing rain masks barely hid anything (the "hidden" stop sat at 94% of a
near-full-viewport ellipse, so almost the whole scroll area still showed rain). Tightened
the mask on every dense/reading-heavy page (admin, superadmin, dashboard, results,
ballot, console) so the animation reads as a small hero/top accent and is fully faded out
behind the body copy/tables, and lowered base opacity (≈.10–.16, down from .20–.34).
`prefers-reduced-motion` continues to fully disable the canvas everywhere.

### 7. Accessibility polish (per audit + spot-fixes)
- Candidate cards: added `role="radiogroup"` + `aria-label` per race, plus **arrow-key
  roving selection** (Up/Down/Left/Right move focus and select within the race, matching
  the standard ARIA radiogroup pattern) alongside the existing Space/Enter selection.
- Mobile sidebar drawers (admin/superadmin/dashboard): added **Escape-to-close** and a
  basic **Tab focus trap** while open — previously only closed via the scrim/menu button.
- Bumped several under-sized mono status/date labels (dashboard's voting-status badge,
  console/dashboard "Key dates" labels, admin/superadmin metric captions, results'
  publish-date chip, total-votes and %-share labels) from ~.6–.66rem to ~.7–.78rem for
  mobile legibility, per "avoid tiny low-contrast labels for important information."
- Admin dashboard count-up: was frame-count-based (`n += t/40` per rAF tick), so a
  throttled/backgrounded tab could show a wrong intermediate election number for far
  longer than intended. Rewrote as time-based with a hard 420ms cap (`Math.min(1,(now-
  start)/DUR)`) so it can never drift; applied the same fix to console's decorative
  stats for consistency.

### 8. Console scroll-reveal blank-by-default (high, from earlier audit note)
`.rv` elements were `opacity:0` as the unconditional baseline, so any environment where
JS doesn't run or an IntersectionObserver never fires (screenshot/print tools, script
errors) left large sections permanently invisible. Restructured so **visible is the
default**; the hidden-then-reveal treatment only applies once an inline `<script>` at
the top of `<head>` confirms JS executed (`html.js .rv{...}`), which runs before body
paint so there's no flash. Also added a 2.5s safety-net timeout that force-reveals
anything an IntersectionObserver missed.

### Bonus fix found during verification (not in the audit)
- `console-redesign.html` had **two elements sharing `id="faq"`** — the FAQ `<section>`
  landmark and the inner render-target `<div>`. `getElementById('faq')` returns the
  *first* match in document order, which was the outer `<section>`, so the FAQ-rendering
  script was overwriting the section's entire contents — silently deleting the "Frequently
  asked" heading and intro paragraph (visible as a bug in the audit's own screenshot).
  Renamed the inner target to `id="faqList"` and repointed both the render call and the
  click-delegation listener. Also swept every file for duplicate IDs (none remaining).

### Verified
- All 8 pages: `new Function()` JS-syntax check passed, HTML tag-balance check passed,
  no duplicate IDs, HTTP 200 from the local preview server after every change.
- Ballot race count (17), results position count (20), admin results position count (20),
  and admin's position dropdown option count (20) cross-checked via small Node scripts —
  all consistent with each other and with the landing page's "20 positions / 17 races" copy.

### Remaining limitations / left for a product decision
- No real browser available in this environment — layout was verified by reasoning
  through the CSS at 1440px/390px breakpoints plus the checks above, not by pixel
  screenshots. A quick device-mode pass is still worth doing, especially: the ballot's
  new mobile bar vs. on-screen keyboard when the "reason" textarea is focused elsewhere,
  and the superadmin confirm dialog on very narrow (320px) phones.
- Candidate photos remain initials-placeholder avatars — `<img>` slots with
  `object-fit:cover` are already wired for when real photos are available.
- The one-time-voter / secret-ballot vs. poll-history tension noted in the earlier
  changelog entry is still open and unrelated to this audit; unchanged this pass.
