# Clean-Architecture Refactor — Audit, Implementation & Migration Report

Date: 2026-07-12 · Scope: `voting-app/` (Next.js 14 App Router + Firebase)

---

## 1. Codebase audit

### Critical

| # | Problem | Files | Resolution |
|---|---------|-------|------------|
| C1 | `/vote` crashed for students who had already voted: the page skipped ballot loading on the already-voted path but still rendered `<BallotContent election={election!}>` with `election === null`, and the already-voted branch reads `election.id` → runtime `TypeError`. The dashboard links voted users straight into this path ("View ballot status"). | `app/vote/page.tsx` | **Fixed.** Page rewritten; already-voted renders with a safe fallback election object. Verified at runtime (see §7). |
| C2 | `/results` before publish showed "Unable to load results" with a **raw Firestore rules evaluation error** ("evaluation error at L342:22 for 'get'…") instead of the designed "Not published yet" state — the `tallies/{id}` read is rules-denied until publish, and the page treated the denial as a load failure. | `lib/results/publicResults.ts` | **Fixed.** `loadPublishedTally` maps `permission-denied` → `null` ("not published"). Verified at runtime. |

### High

| # | Problem | Files | Resolution |
|---|---------|-------|------------|
| H1 | God component: 1,174-line `AdminRedesignConsole` mixed auth gating, data orchestration (5 Firestore subscriptions), five feature panels, dialogs, charts, CSV export, and 25+ `useState` hooks. Every keystroke in any panel re-rendered everything. | `components/admin/AdminRedesignConsole.tsx` | **Fixed.** Decomposed into `components/admin/console/` (5 panels + dialog + chart + bars + data hook + shared utils); orchestrator is now ~260 lines. Panel-local state moved into panels, which also removes cross-panel re-renders. |
| H2 | ~900 lines of dead code: `AdminDashboard.tsx` + all five `admin/tabs/*` components + `BrandLockup.tsx` were imported by nothing. | `components/admin/…`, `components/BrandLockup.tsx` | **Fixed.** Deleted. |
| H3 | Duplicated session-gate: four pages hand-rolled the same `useSession` → loading/denied/redirect effect with copy-pasted denied screens. | `app/{admin,dashboard,superadmin,vote}` pages, `AdminRedesignConsole` | **Fixed.** New `hooks/useGuardedSession` (evaluate → allow/deny/redirect) + shared `components/AccessDeniedScreen`. |
| H4 | Duplicated data access: `loadElection` ×3, position scoping ×3, `snapshotRecords` ×2, `loadCandidates` ×2 — three parallel Firestore read layers that could drift. | `lib/admin/adminData.ts`, `lib/student/ballotData.ts`, `lib/results/publicResults.ts` | **Fixed.** Shared `lib/election/electionRepo.ts` + `lib/firebase/firestore.ts`; role repos re-export or compose. |
| H5 | Duplicated presentation helpers with drift risk: `initials` ×4, `yearLabel` ×3 (three different fallbacks), `ordinalSuffix`, `formatTimestamp`/`toMillis` living in `lib/admin` but imported by the public results page (boundary violation). | pages + components | **Fixed.** `lib/format.ts` (+ existing `lib/initials.ts`); results page no longer imports from `lib/admin`. |

### Medium

| # | Problem | Files | Status |
|---|---------|-------|--------|
| M1 | `/superadmin` is a hard-coded mock (fake admins, fake audit log, personal emails in source) behind a real claim gate; banner says "Backend not connected". | `app/superadmin/page.tsx` | **Open (by design).** Guard migrated to shared hook; panels untouched. Wire to Cloud Functions before enabling actions. |
| M2 | Voters admin panel loads the entire `voters` collection and subscribes to it; render is capped (50 + "show more") but network/memory is O(all voters). Fine at department scale (~hundreds), a risk at real scale. | `lib/admin/adminData.ts` | **Open.** Documented; move to server-side pagination/count aggregation if the registry grows past a few thousand. |
| M3 | Section naming drifts between features: registration writes `BSCS 3-A`, the admin candidate form writes `BSCS-3A`. Data already stored in both shapes; silently unifying would corrupt matching against existing records. | `AuthCard.tsx`, `console/CandidatesPanel.tsx` | **Open.** Needs a product decision + one-time data migration. |
| M4 | `AuthCard` maintains three near-identical form state machines (login/register/guest). | `components/auth/AuthCard.tsx` | **Open.** Candidate for a `useAuthForm` reducer; not done to keep this change reviewable. |
| M5 | Landing page's 20-position list and dashboard's `TOTAL_POSITIONS = 20` / `STUDENT_RACES = 17` are hard-coded, independent of Firestore's positions collection. | `app/page.tsx`, `app/dashboard/page.tsx` | **Open.** Acceptable for static marketing copy; noted so nobody assumes they're live. |

### Low

- `<img>` used for candidate photos (7 lint warnings): Firebase Storage URLs would need `next/image` remote-pattern config; cosmetic performance nit at this scale. Open.
- `.smoke-admin.mjs` duplicates `adminData` operations by hand; superseded by the runtime verify recipe (`.claude/skills/verify/SKILL.md`). Open.
- Legacy pre-migration apps (`web/`, `admin-app/`) still in the repo root; candidates for archival/deletion — not touched (separate decision).
- A Firebase service-account key sits at the repo root. It is **gitignored and untracked** (verified) — keep it that way, and prefer moving it outside the repo entirely.

---

## 2. Folder structure (after)

```
voting-app/
  app/                      # Route shells only: guard + data-load + layout per route
    page.tsx                #   landing + AuthCard
    dashboard/ vote/ results/ superadmin/ admin/
  components/
    AccessDeniedScreen.tsx  # shared 403 screen (admin, dashboard)
    BinaryRain / BrandMark / CountUp / RouteLoading / Interactions
    ui/CustomSelect.tsx     # reusable listbox select (portal, keyboard, groups)
    auth/AuthCard.tsx       # landing auth tabs (login/register/one-time)
    ballot/                 # student ballot feature
    admin/
      AdminRedesignConsole.tsx   # orchestrator: guard, nav, drawer, confirm, data hook
      AnimatedBarFill.tsx
      console/              # admin console feature module
        useAdminElectionData.ts  # load-then-subscribe data orchestration
        OverviewPanel / CandidatesPanel / VotersPanel / ResultsPanel / LifecyclePanel
        ConfirmDialog / NoticeLine / MomentumArea / ResultsBars
        shared.ts           # AdminPanel type, downloadFile, hasVoted, scrollToTop
  hooks/
    useSession.ts           # raw session subscription
    useGuardedSession.ts    # route gate: evaluate(session) → allow | deny | redirect
  lib/
    constants.ts types.ts initials.ts
    format.ts               # formatTimestamp, toMillis, yearLabel, firstName, percent
    firebase/               # infrastructure: config, init (emulator-aware), firestore utils
    election/               # shared domain: electionRepo (reads), candidates (ordering/grouping)
    auth/                   # authService, session, guards-core, validation, errors
    student/                # ballotData, ballotState (pure), voteSubmit
    admin/                  # adminData (mutations/watches/audit), adminCore (aggregation, CSV)
    results/                # publicResults (published tally)
```

**Dependency direction:** `app/` → `components/` → `hooks/` → `lib/{feature}` → `lib/election` → `lib/firebase`. Pure domain logic (`ballotState`, `adminCore` aggregation, `election/candidates`, `format`) has no Firebase imports and is unit-testable in isolation. Feature libs never import each other; shared reads live in `lib/election`.

---

## 3. Architecture breakdown

- **Module boundaries** — Route pages are thin shells: gate the session, load/subscribe data, choose a screen. Feature components own their local UI state; `lib/` owns all Firestore access. No component builds a Firestore query.
- **State management** — Server state comes from Firestore reads + `onSnapshot` subscriptions (`useAdminElectionData`, `useSession`); UI state is local `useState` in the component that owns it. No global store — nothing here needs one.
- **Data fetching** — Load-then-subscribe in the admin console (consistent first paint, then live). Student/public routes are one-shot loads with explicit `loading/ready/denied/error` unions. Aborted-effect guards (`active` flag) prevent set-after-unmount.
- **Error handling** — All Firestore/auth errors surface as user-readable text: `friendlyAuthError` for auth codes, per-watch error → single `role="alert"` line in the console, rules-denied tally read → "not published" state (C2 fix).
- **Validation** — Pure functions in `lib/auth/validation.ts` (patterns exported for reuse), field-level errors rendered inline; server-side enforcement remains in Firestore rules (defense in depth).
- **Testing strategy** — Firestore rules tests exist under `firebase/rules-tests/`. Pure domain modules (`ballotState`, `adminCore`, `format`, `election/candidates`) are now import-clean for unit tests. End-to-end runtime verification is scripted and documented in `.claude/skills/verify/SKILL.md` (emulators + Playwright); the full flow was executed for this refactor (§7).

## 4. Component architecture

- **Reusable:** `CustomSelect` (accessible listbox: portal menu, arrow/Home/End/Enter/Escape, grouped options, disabled + empty states), `CountUp`, `AnimatedBarFill`, `BinaryRain`, `RouteLoading`, `BrandMark`, `AccessDeniedScreen`, `NoticeLine`, `ConfirmDialog`.
- **Feature-specific:** ballot (`BallotContent`, `CandidateModal`), admin console panels, `AuthCard`.
- **Layout:** route shells + the console's topbar/sidebar/drawer in the orchestrator.
- **Feedback/state:** `NoticeLine` (status vs alert semantics), `state-block` empty states everywhere a list can be empty, busy labels on every async button, `RouteLoading` for route-level suspense.
- **Composition pattern:** panels receive data + callbacks (`onNavigate`, `onRequestConfirm`) from the orchestrator; destructive confirmation is centralized in one `ConfirmDialog` instance driven by a `ConfirmState` object. All panels stay mounted (CSS-toggled) so per-panel state survives navigation — deliberate, preserved from the original design.

## 5. Props & API design (key contracts)

```ts
// hooks/useGuardedSession.ts
useGuardedSession(
  evaluate: (s: Session) => { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'redirect'; to: string },
  errorFallback?: string,
): { session; status: 'loading' | 'denied' | 'ready'; deniedReason; signOutToHome }

// components/ui/CustomSelect.tsx  (controlled)
<CustomSelect label value options={{ value, label, group? }[]} placeholder
              disabled? hideLabel? onChange={(value) => …} />

// components/admin/console/ConfirmDialog.tsx  (controlled by ConfirmState | null)
onRequestConfirm({ title, body, confirmLabel, danger?, action })

// lib/format.ts
yearLabel(3) === '3rd Year'; yearLabel(undefined, 'Year pending') === 'Year pending'
```

Defaults: `electionId` parameters default to `ELECTION_ID` across all repos; guard `errorFallback` defaults to a generic message; `yearLabel` fallback defaults to `'—'`.

---

## 6. Verification

- **Type-check:** `tsc --noEmit` clean.
- **Lint:** 0 errors; 7 pre-existing `@next/next/no-img-element` warnings (unchanged class of warning from baseline).
- **Build:** `next build` clean; bundle sizes unchanged vs baseline (± <1 kB per route).
- **Runtime E2E (emulators + Playwright): 18/18 steps pass** — see §7 and `audits/architecture-refactor/e2e-summary.txt`.
- **Accessibility:** auth tabs now full APG pattern (tablist/tab/tabpanel, `aria-controls`, roving tabindex, arrow keys — exercised by keyboard in E2E); review sheet takes initial focus; filter toggles expose `aria-pressed`; confirm dialog focus trap/restore preserved and exercised (Escape probe).
- **Responsive:** admin drawer (mobile breakpoint), scrim, and focus trap preserved as-is; no layout CSS was modified (mockup-derived styles untouched per project convention).
- **Remaining risks:** M1–M5 above; superadmin remains display-only; voters list scale note.

## 7. Runtime E2E evidence (all PASS)

Register student via UI → lands on /dashboard · ballot renders 17 year-scoped races · select-all → review sheet → submit → "Your vote is recorded" · **revisit /vote → already-voted screen (crashed before fix C1)** · student on /admin → 403 · /results pre-publish → "Not published yet" (**raw rules error before fix C2**) · admin sign-in → console live metrics · add candidate via form · roster search filter · voters table shows student "Voted" · results tally bars · close polls + publish through confirm dialogs · Escape cancels destructive confirm without deleting · public results show winner tags · signed-out /dashboard redirects to landing.

## 8. Migration summary — what developers need to know

1. **Import moves** (old → new): `formatTimestamp`/`toMillis` → `@/lib/format`; `candidatesForPosition` → `@/lib/election/candidates`; `loadElection`/`loadPositions`/`watchElection`/`loadCandidates` canonical home is `@/lib/election/electionRepo` (`adminData`, `ballotData`, `publicResults` still re-export their old names — no consumer breakage).
2. **New route-gate idiom:** use `useGuardedSession(evaluate)` + `AccessDeniedScreen`; don't hand-roll session effects.
3. **Admin console:** edit the panel under `components/admin/console/`, not the orchestrator. Panel-local state lives in panels; anything cross-panel (confirm dialog, nav, live data) goes through the orchestrator.
4. **Panels stay mounted** — visibility is CSS (`.panel.on`). Selector-based tests must scope to `.panel.on`.
5. **Behavioral changes shipped** (all deliberate): C1 already-voted crash fixed; C2 unpublished-results state fixed; session-watch errors on /vote now render the Access-denied screen instead of "Ballot unavailable" (message text unchanged, more accurate framing).
6. **Runtime verification recipe:** `.claude/skills/verify/SKILL.md` — emulator bring-up, seeding, admin-claim creation, Playwright gotchas.
