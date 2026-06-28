# CSS Department Voting System — Implementation Plan

**Institution:** St. Clare College of Caloocan — Computer Science Department (CSS)
**Author of plan:** Claude (Opus 4.8) — Lead Architect
**Status:** Planning only. No application code is written yet. This document is the contract Codex (and any other contributor) builds against.
**Source of truth for requirements:** [information.txt](information.txt). Where this plan and `information.txt` disagree, `information.txt` wins.

---

## 0. Requirements distilled from `information.txt`

| # | Requirement | Decision in this plan |
|---|-------------|-----------------------|
| 1 | Firebase project `css-department-voting-system` (config provided) | Use the provided web config verbatim in the web app. |
| 2 | Deploy target `scc-cs-department-vote.web.app` | Add this as a Hosting site / custom site ID. Note it differs from the default `authDomain`. See §9. |
| 3 | 20 positions, **independent candidates only** ("No Alliance just a person") | No party/group field is required, but the data model keeps an optional `party` field as nullable for forward-compatibility; UI hides it when empty. |
| 4 | Year-level Representative positions (1st–4th Year Rep) | **Year-scoped ballots**: a student only sees and can vote for the Representative of their own year level. See §4 and §11. |
| 5 | Admin: graphs + add candidate with name, section, year, platform, etc. | Admin dashboard (web) **and** Python PyWebView app both support candidate CRUD + charts. |
| 6 | Design reference: Xodespace dark-teal theme (Urbanist/Figtree/JetBrains Mono) | Reuse palette, typography, glassmorphism, buttons, cards, reveal animations. |
| 7 | **Do NOT copy** the pixel-wave; replace with **binary rain** (CS-themed). **Do NOT copy** the rotating orb. | Build a `binaryRain` canvas background module; replace the hero orb with a CS-appropriate visual (e.g., animated ballot/check motif or terminal card). |
| 8 | **Mobile-first** — students vote on phones | All student-facing layouts designed at 360px first, scaled up. Touch targets ≥44px. No custom cursor on touch devices. |

### Stakeholder decisions (locked)

- **Voter provisioning:** **Open self-registration with validation.** Students self-register with the official email format **`<name>.scc@gmail.com`** and a **student ID of 7–9 digits**. No admin pre-creation, no approval step, and **no email verification** (fast-paced voting). Abuse is contained by the strict email pattern + unique student ID. See §5 and §9.1.
- **Ballot policy:** **All-at-once, year-aware.** A student must vote for **every position on their ballot in a single submission**. The ballot = the 16 department-wide positions **+ exactly one Year Representative matching the student's year level** (17 races total). No partial submission. See §10 and §11.
- **Tally integrity:** **Strategy B (no billing)** — client transaction writes vote + increments counters; tallies recomputable from immutable `votes`. See §7.

---

## 1. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FIREBASE BACKEND                       │
│                                                              │
│  Authentication   Firestore        Storage      Hosting      │
│  (email/pass +    (elections,      (candidate   (web app +   │
│   custom claims)   candidates,      images)      admin SPA)  │
│                    voters, votes,                            │
│                    tallies, audit)                          │
│                                                              │
│  Security Rules (Firestore + Storage)                       │
│  [Optional] Cloud Functions (trusted tallies, on Blaze)    │
└───────────▲───────────────────────────────▲────────────────┘
            │ Web SDK (rules-enforced)       │ Admin SDK (full access,
            │                                │ service account)
┌───────────┴───────────┐        ┌───────────┴───────────────┐
│  WEB VOTING APP        │        │  PYTHON PYWEBVIEW ADMIN    │
│  (mobile-first SPA)    │        │  APP (desktop)             │
│  - Student login       │        │  - Candidate mgmt          │
│  - Candidate cards     │        │  - Voter mgmt              │
│  - Voting flow         │        │  - Election controls       │
│  - Confirmation        │        │  - Results + charts        │
│  - Admin dashboard     │        │  - Export / audit          │
│    (web, role-gated)   │        │                            │
└────────────────────────┘        └────────────────────────────┘
```

Two admin surfaces exist by design:
- **Web admin dashboard** — role-gated route inside the web app, for quick monitoring from any device.
- **Python PyWebView admin app** — desktop tool using the Firebase **Admin SDK** (service account) for privileged batch operations, offline-capable management, and exports. It is the authoritative management console.

---

## 2. Technology stack

### Web voting app
- **LOCKED (Phase 0 review):** **Build-free** — plain HTML/CSS/JS ES modules + **Firebase CDN modular SDK v10.14.1**, no Vite/npm/bundler. Hosting public root stays `web/` (no `dist` build step). Rationale: simpler deploy, easier for the department to maintain, and the admin charts are achievable with vanilla JS + Chart.js (CDN). If the admin dashboard later outgrows this, the upgrade path is: introduce Vite, set Hosting `public` to `web/dist`, and add a build step — but do not do this unless clearly needed.
- **Firebase Web SDK v10.14.1** (modular, via gstatic CDN).
- **Charts:** Chart.js v4 via CDN (lightweight, responsive, good for bar/pie/doughnut/line).
- **Emulator note (Phase 0):** Firestore emulator runs on **port 8081** (8080 occupied locally by httpd). firebase.json and `web/src/firebase/init.js` are both set to 8081 — keep them in sync.
- **Styling:** Hand-written CSS using the Xodespace token system (CSS custom properties). No Tailwind required.
- **Fonts:** Urbanist (headings), Figtree (body), JetBrains Mono (labels/mono).

### Python admin app
- **Python 3.11+**
- **pywebview** (window + JS↔Python bridge)
- **firebase-admin** (Firestore, Auth, Storage via service account)
- **Chart.js inside the webview UI** (preferred) OR matplotlib rendered to PNG. Default: Chart.js in the embedded HTML for visual consistency with the web app.
- **Packaging:** PyInstaller for a distributable `.exe` (Windows, matching the dev environment).

### Tooling
- Firebase CLI for emulators, rules deploy, hosting deploy.
- Firebase Local Emulator Suite for safe development (Auth + Firestore + Storage) — never test against production data.

---

## 3. Recommended project structure

```
CSS-Department-Voting-System/
├─ information.txt
├─ model_roles.md
├─ PROJECT_PLAN.md                ← this file
│
├─ web/                           ← Firebase Hosting root (web voting app + web admin)
│  ├─ index.html                  ← student entry (login)
│  ├─ vote.html / routes          ← voting flow (or SPA routes)
│  ├─ admin/                      ← role-gated admin dashboard
│  ├─ src/
│  │  ├─ firebase/
│  │  │  ├─ config.js             ← provided firebaseConfig
│  │  │  └─ init.js               ← initializeApp, auth, db, storage exports
│  │  ├─ auth/                    ← login, session, role checks
│  │  ├─ student/                 ← ballot rendering, candidate cards, vote submit
│  │  ├─ admin/                   ← dashboard, candidate/voter mgmt, charts
│  │  ├─ ui/
│  │  │  ├─ theme.css             ← Xodespace tokens
│  │  │  ├─ components.css
│  │  │  └─ binaryRain.js         ← REPLACEMENT for pixel-wave (CS binary rain)
│  │  └─ lib/                     ← shared helpers (validation, formatting)
│  └─ assets/
│
├─ admin-app/                     ← Python PyWebView desktop admin
│  ├─ main.py                     ← pywebview bootstrap, window, JS API class
│  ├─ api/
│  │  ├─ firebase_admin_init.py   ← service account init
│  │  ├─ candidates.py            ← CRUD
│  │  ├─ voters.py                ← CRUD / bulk import
│  │  ├─ elections.py             ← lifecycle controls
│  │  ├─ results.py               ← tally + audit queries
│  │  └─ exports.py               ← CSV/PDF export
│  ├─ ui/                         ← embedded HTML/CSS/JS (Chart.js, same theme)
│  ├─ requirements.txt
│  └─ serviceAccountKey.json      ← GIT-IGNORED, never committed
│
├─ firebase/
│  ├─ firestore.rules
│  ├─ storage.rules
│  ├─ firestore.indexes.json
│  └─ functions/                  ← OPTIONAL (Blaze) trusted tallies
│
├─ firebase.json                  ← hosting + emulator + rules config
├─ .firebaserc                    ← project + hosting site aliases
├─ .gitignore                     ← serviceAccountKey.json, node_modules, dist, .env
└─ docs/                          ← seed data, runbooks
```

---

## 4. Data model (Firestore)

Firestore chosen over Realtime Database: richer queries, per-document security, easier audit/export, good fit for charts.

### Collections

**`elections/{electionId}`** — supports multiple/seasonal elections.
```
{
  title: "CSS Department Election 2026",
  status: "draft" | "open" | "closed" | "published",  // lifecycle, see §6
  positions: [ "president", "vp_internal", ... ],      // ordered position IDs
  openAt: Timestamp, closeAt: Timestamp,
  createdAt, updatedAt
}
```

**`positions/{positionId}`** — the 20 fixed positions (seeded).
```
{
  name: "President",
  order: 1,
  scope: "department" | "year",     // year-scoped for the 4 Year Reps
  yearLevel: null | 1 | 2 | 3 | 4,  // set when scope = "year"
  maxSelections: 1                   // one winner per position
}
```
Seed list (order matters for ballot display):
1 President · 2 VP-Internal · 3 VP-External · 4 Secretary · 5 Treasurer · 6 Auditor · 7 P.R.O · 8 Business Manager Committee · 9 Academic Committee Chair · 10 Research Committee Chair · 11 ICT Committee Chair · 12 Events Committee Chair · 13 Sports Committee Chair · 14 Environmental Committee Chair · 15 Membership Committee Chair · 16 Community Committee Chair · 17 4th Year Rep (scope=year, yearLevel=4) · 18 3rd Year Rep (year=3) · 19 2nd Year Rep (year=2) · 20 1st Year Rep (year=1).

**`candidates/{candidateId}`**
```
{
  electionId,
  positionId,
  name: "Juan Dela Cruz",
  section: "BSCS 3-A",
  yearLevel: 3,
  platform: "Short platform / description text",
  party: null,                    // independent; kept nullable per req #3
  photoURL: "<Storage download URL>",
  photoPath: "candidates/{id}.jpg",
  order: 1,                        // display order within position
  active: true,
  createdAt, updatedAt
}
```

**`voters/{uid}`** — one doc per **self-registered** student; `uid` = Firebase Auth UID. Created by the student at registration (rules restrict which fields they may set).
```
{
  studentNo: "1234567",           // 7–9 DIGITS ONLY (string of digits), unique
  fullName: "Maria Santos",
  email: "maria.santos.scc@gmail.com", // MUST match <name>.scc@gmail.com
  yearLevel: 2,                   // 1–4; drives year-scoped ballot (Year Rep); locked after first vote
  section: "BSCS 2-B",
  eligible: true,                 // admin can disable; student cannot set/raise
  hasVoted: { electionId: true }, // map: quick "already finished" flag (set by the vote transaction)
  votedAt: { electionId: Timestamp },
  createdAt, updatedAt
}
```
> Self-set at registration: `studentNo`, `fullName`, `email`, `yearLevel`, `section`. Server/rules-controlled: `eligible` (default true, only admin may change), `hasVoted`/`votedAt` (only the vote transaction may set). `studentNo` uniqueness is enforced via a `studentIndex/{studentNo}` guard doc (see §11).

**`studentIndex/{studentNo}`** — uniqueness guard so one student ID maps to one account.
```
{ uid, createdAt }   // created in the same transaction as voters/{uid}; create-only
```
> **Binding requirement (Phase 1 review):** the `studentIndex` create rule MUST tie the doc ID to the voter's `studentNo` via `getAfter(voters/{auth.uid}).studentNo == studentNo`. Without this, a client can create `voters/{uid}.studentNo = "1234567"` while writing `studentIndex/7654321`, defeating uniqueness (only index IDs would be unique, not the actual student numbers).

**`votes/{voteId}`** — **deterministic ID enforces one-vote-per-position**:
`voteId = ${electionId}__${uid}__${positionId}`
```
{
  electionId, uid, positionId, candidateId,
  yearLevel,                      // copied for audit/turnout-by-year
  createdAt: serverTimestamp()
}
```
The composite ID is the linchpin of anti-double-voting: a second write to the same ID is rejected by a security rule that forbids updates/overwrites (create-only). See §8.

**`tallies/{electionId}`** — aggregate counters for live charts (avoids reading every vote).
```
{
  perCandidate: { candidateId: count, ... },
  perPosition:  { positionId: totalVotesCast, ... },
  turnout: { total: n, byYear: {1:n,2:n,3:n,4:n} },
  updatedAt
}
```
Tallies are **denormalized**. Two strategies (pick one — see §7):
- (A) **Cloud Function** `onCreate(votes/*)` increments tallies — trustworthy, needs Blaze.
- (B) **Client transaction** writes the vote doc AND increments tallies atomically — no Functions, but tally integrity leans on rules + audit recompute.

**`audit/{autoId}`** — append-only audit log (admin actions + vote events).
```
{ ts, actorUid, actorRole, action, target, details }
```

### Custom claims (Auth)
- Admins carry a custom claim `{ admin: true }` (or `{ role: "admin" }`), set via the Python Admin app / Admin SDK. Security rules and the web admin route gate on this claim — never on a client-set field.

---

## 5. User roles

| Role | How identified | Capabilities |
|------|----------------|--------------|
| **Student / Voter** | **Self-registered** Firebase Auth user (email `<name>.scc@gmail.com`, valid 7–9 digit student ID) with a `voters/{uid}` doc, no admin claim | Register, log in, view own year-scoped ballot, cast a complete all-at-once ballot, see confirmation + "you have voted" status. Cannot read others' votes or any tally before publish. |
| **Admin** | Firebase Auth user with custom claim `admin:true` | Full read of votes/tallies/audit, candidate CRUD, voter CRUD, election lifecycle control, exports. Web dashboard + Python app. |
| **System (Admin SDK)** | Service account in Python app / Cloud Functions | Bypasses rules; used for privileged batch ops, claim assignment, recompute, seeding. |

**Student registration is open and self-service** (per stakeholder decision) but **gated by validation**:
- Email must match the official format **`<name>.scc@gmail.com`** (local part ends in `.scc`, domain exactly `gmail.com`) — enforced at registration and re-checked in security rules. No email verification step.
- **Student ID = 7–9 digit number**, stored on the `voters/{uid}` doc as `studentNo`; uniqueness enforced (see §11).
- On first registration the student selects/sets their **year level** (1–4) and **section**; year level drives the year-scoped ballot and is **not** student-editable after first vote.

Bootstrapping: the **first admin** is created via the Python Admin app (Admin SDK sets the custom claim) — there is no self-service admin signup. Admins are never created through the open student registration path.

---

## 6. Election lifecycle (state machine)

```
draft ──open──▶ open ──close──▶ closed ──publish──▶ published
  ▲                                  │
  └───────────── reopen ◀────────────┘ (admin only, audited)
```

- **draft** — admin sets up positions/candidates; no voting; nothing public.
- **open** — students may vote (only between `openAt`/`closeAt` if set). Tallies update live but are **admin-only**.
- **closed** — voting disabled (rules reject new votes); admin reviews; results still admin-only.
- **published** — results become readable by students (optional public results page).

Voting is allowed **only** when `elections/{id}.status == "open"`. This is enforced in security rules by reading the election doc, so a tampered client cannot vote after close.

---

## 7. Live tallies & charts strategy

**Recommended default: Strategy B (no Blaze) for v1, with a documented upgrade path to Strategy A.**

- **Strategy B (client transaction) — SELECTED, REVISED after Phase 1 review:** Because voting is **all-at-once**, a single Firestore `runTransaction` on submit does, atomically: (a) creates **all 17** `votes/{deterministicId}` docs (16 department + 1 year rep), and (b) sets `voters/{uid}.hasVoted[electionId] = true` + `votedAt`. All-or-nothing: a student either casts a complete ballot or nothing.
  - **Clients do NOT write the `tallies` collection.** (Phase 1 review found that any client-writable tally is arbitrarily forgeable under Strategy B — see below.) The immutable `votes` collection is the **single source of truth**.
  - **Live admin counts** are computed by the admin dashboard subscribing (`onSnapshot`) directly to the `votes` collection (admin-only read; department scale ≈ a few thousand vote docs is well within limits). Turnout total and by-year are derived the same way.
  - **`tallies/{electionId}` is admin-write-only**: after voting day ends, the admin (web dashboard or Python app) recomputes the final counts from `votes` and writes/publishes the `tallies` doc. Students read it only once the election is `published`. This keeps the free tier (no Cloud Functions) while removing the client tally-tampering surface.
  - The full immutability + per-position uniqueness of `votes` guarantees results integrity regardless of client behavior. Strategy A (Cloud Functions) remains the upgrade if real-time student-facing tallies are ever needed.
- **Strategy A (Cloud Functions, Blaze):** Voters write only the vote doc; a `functions.firestore.onCreate` trigger updates tallies server-side. Clients cannot touch tallies at all → strongest integrity. Switch to this if the department enables billing.

**Charts (both admin surfaces), powered by `tallies` + live `onSnapshot`:**
1. **Live vote counts** — bar chart, votes per candidate (filterable by position).
2. **Vote distribution per position** — doughnut/pie per position.
3. **Turnout** — gauge/progress + line over time; total and **by year level** (ties into Year Rep scoping).
4. **Candidate rankings** — sorted horizontal bar (leaderboard) per position.

Admin views subscribe with `onSnapshot` for real-time updates without refresh.

---

## 8. Security rules strategy

### Firestore (`firestore.rules`) — core principles
- **Default deny.** Every collection explicitly allowed.
- Helpers: `isSignedIn()`, `isAdmin()` (`request.auth.token.admin == true`), `isSelf(uid)`, `electionOpen(eid)` (reads `elections/{eid}.status == "open"`).

| Collection | read | create | update | delete |
|-----------|------|--------|--------|--------|
| `elections` | signed-in (status/title only) | admin | admin | admin |
| `positions` | signed-in | admin | admin | admin |
| `candidates` | signed-in | admin | admin | admin |
| `voters/{uid}` | self or admin | **self** (uid==auth.uid, validated) or admin | admin (self may update profile but not `eligible`/`hasVoted`; `yearLevel` locked after first vote) | admin |
| `studentIndex/{studentNo}` | admin | signed-in, create-only, id is 7–9 digits, payload `uid==auth.uid` | never | admin |
| `votes/{id}` | **admin only** (students never read votes) | signed-in **iff** all guards below | **never** (create-only) | never |
| `tallies` | admin only (until election `published`, then signed-in read of results) | admin only | **admin only** (clients never write tallies — revised Phase 1) | admin |
| `audit` | admin only | signed-in (append) / admin | never | never |

**Vote `create` guard (the heart of anti-cheating):**
```
allow create: if isSignedIn()
  && request.auth.uid == request.resource.data.uid
  && voteIdMatches(electionId, uid, positionId)        // doc ID is composite & not forgeable
  && electionOpen(request.resource.data.electionId)    // only while open
  && voterIsEligible(request.auth.uid)                 // voters/{uid}.eligible == true
  && positionAllowedForVoter(positionId, uid)          // year-scope check for Year Reps
  && candidateMatchesPosition(candidateId, positionId) // candidate truly runs for this position
  && !exists(/databases/$(db)/documents/votes/$(voteId)); // no overwrite → one vote/position
// no allow update / allow delete → votes are immutable
```
`positionAllowedForVoter` rejects a 2nd-year student trying to vote for the 3rd Year Rep, etc.

> **Accepted deviation (Phase 3 review):** `positionAllowedForVoter` does NOT read `positions/{positionId}` — it hardcodes the 16 department position IDs and the 4 `year_rep_N → yearLevel N` mappings directly in the rules. Reason: a single all-at-once 17-vote batch where every vote read both its position and candidate docs exceeded Firestore's per-request document-access budget. The hardcoded form is security-equivalent for the locked 20 positions (year-scope preserved, unknown positionId denied, candidate-position match still enforced). **Conditions:** (1) the position-ID list is now duplicated in `firestore.rules` and `firebase/seed-data.js` — both carry a cross-reference comment and MUST change in lockstep if positions ever change; (2) Phase 6 must smoke-test the real 17-vote batch against **production** rules (emulator and prod have historically differed on rules access-limit enforcement) before go-live.

**Voter self-registration `create` guard:**
```
allow create: if isSignedIn()
  && voterId == request.auth.uid                         // can only create own doc
  && request.resource.data.email.matches('^[a-z0-9._-]+[.]scc@gmail[.]com$')  // <name>.scc@gmail.com
  && request.resource.data.studentNo.matches('^[0-9]{7,9}$')  // 7–9 digit ID
  && request.resource.data.yearLevel in [1,2,3,4]
  && request.resource.data.eligible == true              // cannot self-grant special state
  && !('hasVoted' in request.resource.data);             // hasVoted only set by vote txn
```
The `studentIndex/{studentNo}` create-only doc (written in the same transaction) enforces one account per student ID. Self `update` rules forbid changing `eligible`/`hasVoted` and lock `yearLevel` once any vote exists.

### Storage (`storage.rules`)
- `candidates/{file}`: **read** = signed-in; **write** = admin only, `request.resource.contentType.matches('image/.*')` and size ≤ ~2MB. Students can never upload.

### Notes
- The provided `firebaseConfig` (apiKey etc.) is **not a secret** — it only identifies the project; security rests on Auth + rules. The **service account key** for the Python app **is** secret and must be git-ignored.

---

## 9. Firebase services & setup

1. **Authentication** — enable **Email/Password** with **open self-registration**; **email verification disabled** (fast voting). Registration is gated client-side AND revalidated on the `voters/{uid}` write: email must match `^[a-z0-9._-]+\.scc@gmail\.com$`; `studentNo` must be a 7–9 digit number; year level 1–4 required. Admins get custom claims via Admin SDK (never via registration).
2. **Firestore** — production mode, region `asia-southeast1` (closest to PH). Deploy rules + indexes.
3. **Storage** — same region; deploy storage rules; bucket per provided config (`...firebasestorage.app`).
4. **Hosting** — create a Hosting **site** with ID `scc-cs-department-vote` so the app serves at `scc-cs-department-vote.web.app` (the `information.txt` deploy target). Map it in `.firebaserc` `targets`. Note this differs from the default `authDomain` (`css-department-voting-system.firebaseapp.com`); **add `scc-cs-department-vote.web.app` to Auth → Settings → Authorized domains** or login will fail on the custom site.
5. **(Optional) Cloud Functions** — only if Strategy A tallies are chosen (requires Blaze).

---

## 10. Web app — pages & UX flow (mobile-first)

**Student flow:**
1. **Register** (`index.html` / register view) — email (**must match `<name>.scc@gmail.com`**), password, **student ID (7–9 digits)**, full name, **year level (1–4)**, section. Inline validation with clear messages (bad email format, wrong-length/non-numeric ID, duplicate ID). No email-verification step. Creates the Auth user + `voters/{uid}` + `studentIndex/{studentNo}` (transactional).
2. **Login** — returning students sign in with email + password. Clear errors for wrong credentials / unverified.
3. **Ballot** — single scrollable list, positions in seeded order: **all 16 department positions + the one Year Rep matching the student's `yearLevel`** (17 races). Each position shows candidate **profile cards**: photo, name, position, section/year, short platform/description, optional party (hidden when null). One selectable card per position (radio semantics, ≥44px targets). **All-at-once requirement:** the "Continue" action is disabled until **every** position on the student's ballot has a selection; the UI highlights any unanswered race.
4. **Review / Confirm** — summary of all selections; explicit "Confirm Vote" with a warning that it is final and cannot be changed. (No abstain option per stakeholder decision; if needed later, add an explicit "Abstain" choice per race.)
5. **Submit** — a single transaction writes **all** vote docs + increments tallies + sets `voters/{uid}.hasVoted`; optimistic disabled state to prevent double-tap.
6. **Success status** — confirmation screen + persistent "You have already voted" state on return (driven by `voters/{uid}.hasVoted`).

**Admin dashboard (role-gated `/admin`):**
- Live monitoring (charts from §7), candidate management (CRUD + image upload), voter management (list/enable/disable/import), election controls (lifecycle buttons), audit-friendly vote records table with export.

**Design system (from `information.txt`, adapted):**
- Reuse Xodespace tokens: teal palette, `--radius-*`, glow, glass surfaces, `.btn-primary/.btn-ghost`, `.card`, scroll-reveal (`.rv`), counters.
- **Background:** `binaryRain.js` (falling `0/1` columns in teal ramp) **instead of** the pixel-wave canvas.
- **Hero:** replace the rotating orb with a CS/voting-appropriate visual (e.g., animated ballot-check, terminal/"vote cast" card, or subtle node graph). No orb.
- **Mobile-first:** base styles target ~360px; enhance upward with `min-width` media queries. Disable custom cursor and heavy canvas effects on touch / `prefers-reduced-motion`.

---

## 11. Edge cases & anti-cheating protections

**Voting integrity**
- **One vote per position:** deterministic composite `voteId` + create-only rule + `!exists` guard (§8). Even with a manipulated client, a duplicate write fails.
- **Voting after close:** rules read live election status; client clock is irrelevant.
- **Year-Rep cross-voting:** `positionAllowedForVoter` blocks voting outside one's year level.
- **Candidate/position mismatch:** rule verifies the chosen candidate actually runs for that position.
- **Ineligible / disabled voter:** `voters/{uid}.eligible` gate in rules.
- **Double submit / network retry:** idempotent by design (same composite IDs); the whole-ballot transaction re-running can't create duplicates, and `hasVoted` short-circuits a second attempt. UI also disables the button and shows a spinner.
- **All-at-once enforcement:** the ballot transaction must contain a complete set of vote docs for the student's required positions (16 department + their year rep). The client blocks submission until complete; the rules reject any vote write once `voters/{uid}.hasVoted[electionId]` is true, so no top-up votes after the ballot is cast.
- **Registration validation:** email must match `<name>.scc@gmail.com`; `studentNo` must be a 7–9 digit numeric string. Enforced client-side and re-checked on the `voters/{uid}` create rule. No email verification (fast voting), so the strict email pattern + unique student ID are the abuse barrier.
- **Duplicate student ID:** the `studentIndex/{studentNo}` guard doc is create-only; a second registration with the same ID fails the transaction → one account per student ID.
- **Year-level tampering at registration:** `yearLevel` is set once at registration and locked after the first vote; the year-scope rule (`positionAllowedForVoter`) still independently blocks cross-year Rep voting, so a wrong/edited year cannot unlock another year's Rep race at vote time.

**Account / access**
- No self-service admin signup; admin claims set only via Admin SDK.
- Students can't read the `votes` collection or pre-publish tallies → ballot secrecy + no live-result leakage that could sway voters.
- Admin actions logged to immutable `audit` collection.

**Operational edge cases**
- Image upload failures / oversized images → client validation + Storage rule size/type limits; candidate save tolerates missing photo (placeholder avatar).
- Duplicate student records / re-import → Python app upserts by `studentNo`; surfaces conflicts.
- Tally drift (Strategy B) → "Recompute from votes" admin action; votes are the source of truth.
- Custom-domain auth failure → ensure `scc-cs-department-vote.web.app` is in Authorized domains (§9.4).
- Network loss mid-vote → transaction is all-or-nothing; user retries safely.
- Time zone → store all timestamps as Firestore server timestamps (UTC); display in Asia/Manila.

**Known limitations to disclose**
- Without Cloud Functions (Strategy B), a determined authenticated voter could attempt to inflate tally counters; mitigated by rules (increment-only within the same transaction that writes their single vote) and fully recoverable via recompute. For maximum integrity, enable Blaze + Strategy A. This tradeoff is documented for stakeholder sign-off.

---

## 12. Development phases (sequenced for Codex)

**Phase 0 — Project scaffolding**
- Create `web/`, `admin-app/`, `firebase/` trees; `firebase.json`, `.firebaserc` (with `scc-cs-department-vote` hosting target), `.gitignore` (service account, node_modules, dist).
- Wire Firebase Web SDK init from the provided config. Stand up the Emulator Suite.

**Phase 1 — Data & rules foundation**
- Seed `positions` (20) and a `draft` election. Write `firestore.rules`, `storage.rules`, `firestore.indexes.json`. Test rules against emulator (allow/deny matrix from §8).

**Phase 2 — Auth & roles**
- Email/password login, session handling, route guards. Admin custom-claim path (set via Python app). `voters/{uid}` linkage on login.

**Phase 3 — Student voting flow (mobile-first)**
- Theme tokens + `binaryRain.js` + non-orb hero. Ballot rendering with year-scoping, candidate cards, review/confirm, transactional submit, success/"already voted" state.

**Phase 4 — Web admin dashboard**
- Role-gated routes; candidate CRUD + image upload; voter management; election lifecycle controls; live charts (§7) via `onSnapshot`; audit/vote records table + export.

**Phase 5 — Python PyWebView admin app**
- `firebase-admin` service-account init; JS↔Python bridge; candidate/voter/election/results modules; embedded Chart.js UI in the shared theme; CSV/PDF export; first-admin bootstrap (claim assignment); PyInstaller packaging.

**Phase 6 — Hardening & deploy**
- Full rules test pass; anti-cheating scenarios from §11 exercised; accessibility + mobile QA; add custom domain to Authorized domains; `firebase deploy` to `scc-cs-department-vote.web.app`; dry-run election with seed data; runbook in `docs/`.
- **MUST:** smoke-test the real all-at-once 17-vote batch against **production** Firestore rules (not just the emulator) to confirm it stays within the document-access budget — see the accepted Phase 3 deviation in §8.

---

## 13. Stakeholder decisions & remaining open questions

**Resolved (locked):**
1. ✅ **Voter provisioning:** Open self-registration, validated by `.scc` email + 7–9 digit student ID. No admin pre-creation/approval.
2. ✅ **Ballot policy:** All-at-once required; ballot is year-aware (16 department races + the student's one Year Rep).
3. ✅ **Tally integrity:** Strategy B (no billing).

4. ✅ **Results visibility:** Results are **published to students after voting day ends** (admin moves the election to `published` after `close`; before that, tallies/results are admin-only).
5. ✅ **Email rule precision:** Accepted format is **`<name>.scc@gmail.com`** — the local part must end in `.scc` and the domain must be exactly `gmail.com`. Combined with the unique 7–9 digit student ID, this prevents abuse. Regex: `^[a-z0-9._-]+\.scc@gmail\.com$` (case-insensitive).
6. ✅ **Email verification:** **None** — fast-paced voting is the priority; abuse is contained by the strict email pattern + unique student ID guard.

**Still open (low priority, resolve before/within Phase 1):**
7. **Candidate count per position / write-ins?** (Abstain is excluded per decision #2 unless revisited.)

---

*End of plan. Codex: build strictly against §3 (structure), §4 (schema), §8 (rules), and §12 (phases). Flag any deviation back to the architect before implementing.*
