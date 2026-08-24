# Security & Integrity Audit — CSS Department Voting System

**Date:** 2026-08-23 · **Scope:** Full stack (Firebase Auth, Cloud Functions 28 callables, Firestore rules, Storage rules, Next.js static frontend, repository hygiene, dependencies)
**Method:** Static code review with file:line evidence (4 parallel deep-dive streams). Dynamic red-team execution marked `[DYNAMIC-PENDING]` where runtime confirmation is required. Threat model: client fully attacker-controlled.
**Companion docs:** `docs/RATE_LIMIT_HARDENING.md` (surge fixes already implemented), `docs/go-live-checklist.md`.

---

## Deliverable 1 — Security Architecture Review

```
Browser (Next.js static export)
  ├─ Firebase Auth (email/password, NO email verification)      ← identity root
  ├─ Firestore direct SDK reads/writes                          ← gated ONLY by firestore.rules
  ├─ Cloud Storage direct upload/download                       ← gated by storage.rules + token URLs
  └─ HTTPS Callables (28)                                       ← trusted backend, Admin SDK
        └─ Firestore (Admin SDK, bypasses rules) → ballots/, tallies/, students/, audit/
Firebase Hosting (static, HSTS/nosniff/DENY/Referrer/Permissions headers; no CSP)
```

**Enforcement layers:** security decisions live in (a) Firestore/Storage rules and (b) callable guards (`authGuards.js`). Frontend guards are UX only — correctly treated as non-security throughout this audit.

**What is genuinely strong**
- Secret ballot design: anonymous ballots (random IDs, no uid/timestamp), client-denied collection, participation stored separately (`firestore.rules:342-350`, `index.js` submitBallot).
- One-vote guarantee: single atomic transaction on voter doc + ballots (`index.js:115-169`).
- Authoritative results: tallies recomputed from immutable ballots (`getResults`, `publishTally`, `finalizeOps`), never trusted from mutable counters.
- Deny-by-default catch-all rule (`firestore.rules:387-389`); ballots/tallies/students unwritable by any client.
- Server-side roster binding at vote time (`resolveRosterRecord`, `validateRosterEligibility`).

**Structural weaknesses (drive the findings below)**
1. **Identity is assertion-based, not proof-based** — no email/ownership verification anywhere; possession of a name+studentNo+email-pattern is enough to become that voter (V-01).
2. **The election state machine does not exist server-side** — draft↔open↔closed transitions are raw client `updateDoc`s permitted by overly broad rules (V-02).
3. **Two parallel admin mutation paths** (guarded callables vs. rules-permitted direct SDK writes) — the direct paths skip every validation and audit the callables provide (V-02, V-04, V-11, V-12).

**Final-model verdict:** Uniqueness ✅ · Result integrity ✅ (given immutability holds) · Privacy ✅ · Auditability ⚠️ partial · Eligibility ✅ server-side · **Identity ❌** · Availability ✅ post-hardening (load test pending).

---

## Deliverable 2 — API Endpoint Security Matrix

Rules-path matrix (clients) summarized; callables below. R=read C=create U=update D=delete.

### Firestore rules matrix (client-reachable)

| Path | R | C | U | D | Field validation on writes |
|---|---|---|---|---|---|
| elections/{id} :270 | signed-in ∨ published | any admin | admin ∧ (super ∨ ¬locked∧¬finalized) | same | **NONE** (V-02) |
| positions/{id} :282 | **public** | configWritable | configWritable | configWritable | **NONE** |
| candidates/{id} :289 | signed-in ∨ published(electionId) | candidateWritable(new.electionId) | candidateWritable(**old**.electionId) | same | **NONE** (V-04) |
| voters/{uid} :295 | self ∨ admin | admin ∨ strict self-create validators | (admin+lock-gated) ∨ strict self-update | admin+lock-gated | whitelist on self-paths; fullName/section unchecked (V-18) |
| students/{no} :319 | admin ∨ own-record | false | false | false | n/a (function-only) |
| studentIndex/:324 emailIndex/:331 | admin | strict self-create | false | admin (**¬lock-gated**) | whitelisted |
| ballots/{id} :342 | false | false | false | false | n/a |
| tallies/{eid} :346 | admin ∨ published | false | false | false | n/a |
| audit/{id} :352 | admin | admin ∧ ts/actor bound | false | false | hasAll not hasOnly; details/action free (V-12) |
| admins/{email} :363 | super ∨ self-doc | super ∧ strict shape | false | super | whitelisted, role=="admin" fixed |
| config/{id} :372 | **public** | super ∧ strict shape | same | super | whitelisted |
| backups/{id} :381 | admin | super (**no shape check**) | super | super | none |

### Callable matrix (28 endpoints)

| Callable | Auth | Role | AC | Input bounds | Writes | Server audit |
|---|---|---|---|---|---|---|
| submitBallot (index.js:95) | ✔ | voter | ✔ | ⚠️ selections unbounded (V-13) | ballots + own lock (tx) | none (privacy by design) |
| checkMyRosterStatus (:244) | ✔ | voter | ✔ | electionId uncapped | – | – |
| verifyStudentAgainstRoster (:263) | ✖ pre-auth by design | – | ✔ | strings coerced, no length caps | – | – |
| deleteRosterEntries (:321) | ✔ | admin | ✖ | ids ≤64 chars, ≤MAX_ROSTER_ROWS | students batch-del | ✔ roster.remove |
| importRoster (:378) | ✔ | admin | ✖ | rows ≤20000, normalized | students upsert | ✔ roster.import |
| getResults (:508) | ✔ | admin | ✖ | electionId uncapped | – | – |
| createAdminAccount (:521) | ✔ | **super (claims)** | ✖ | email regex, pw ≥8 no max | AuthUser + admins/{email} | ✔ |
| publishTally (:569) | ✔ | admin | ✖ | electionId uncapped | tally set + status=published (**non-tx**, V-11) | **✖ (client-authored)** |
| createElection (electionOps.js:24) | ✔ | super | ✖ | positions[] **uncapped**, metadata accepts arrays | elections create | ✔ |
| updateElection (:68) | ✔ | super | ✖ | force overrides finalized; **no vote-existence guard**; dates mutable | election update | ✔ (force flagged) |
| resetAllElectionData (:139) | ✔ | super | ✖ | exact confirmation phrase; blocks only `locked`; **runs on open** (V-06) | nukes 6 collections + voter Auth users | ✔ |
| archiveElection (:204) / restoreElection (:231) | ✔ | super | ✖ | status-gated only | status flips | ✔ both |
| lockElection (:255) / unlockElection (:281) | ✔ | super | ✖ | unlock has **no preconditions** | locked flag | ✔ both |
| estimateReset (:304) | ✔ | super | ✖ | – | – | – |
| resetElectionData (:379) | ✔ | super | ✖ | scope whitelist; requires fresh backup; **no lock/status check — runs on open** (V-06) | scoped deletes + lock clears | ✔ |
| createBackup / restoreBackup / deleteBackup (backupOps.js:32/:121/:227) | ✔ | super | ✖ | backupId string; overwrite bool | Storage JSON + Firestore meta; restore merge/overwrite | ✔ ×3 |
| databaseDoctor / databaseRepair (doctorOps.js:17/:56) | ✔ | super | ✖ | repair ids[] **uncapped** (V-13) | repair writes | ✔ both |
| verifyResults / finalizeElection (finalizeOps.js:31/:54) | ✔ | super | ✖ | verification-gated finalize | tally + status=finalized | ✔ both |
| importCandidates (candidateOps.js:18) | ✔ | admin ∧ ¬lock∧¬finalized | ✖ | rows ≤10000 validated | candidates upsert; **no ballot guard** (V-04) | ✔ |
| savePosition / deletePosition (positionOps.js:18/:77) | ✔ | admin ∧ ¬lock∧¬finalized | ✖ | well-bounded | positions | ✔ ×2 |
| updateRosterStudent (rosterStudentOps.js:15) | ✔ | admin ∧ ¬lock∧¬finalized | ✖ | id uncapped; fields bounded | students update | ✔ |

Guard internals (`authGuards.js`): `assertAdmin` = custom claims **OR** `admins/{token.email}` registry doc — **email_verified never checked anywhere in repo**. `assertSuperAdmin` = claims only. `assertElectionConfigWritable` returns **success when the election doc doesn't exist** (:58).

---

## Deliverable 3 — Authentication & Authorization Audit

| Control | Status | Evidence |
|---|---|---|
| Password hashing | ✅ Handled by Firebase Auth (scrypt server-side); app never touches hashes | — |
| Password policy | ⚠️ Admin ≥8 chars no max (`constants.js`), students fall back to Firebase min 6; no complexity/breach checks | index.js:66 |
| Brute force | ✅ Firebase Identity Toolkit built-in throttling; no custom bypass paths | — |
| Account enumeration | ⚠️ `createAdminAccount` distinguishes `already-exists`; student signup reveals existing emails (inherent to open registration) | index.js:549 |
| Session generation/expiry | ✅ Firebase ID tokens (1h, auto-refresh, asymmetric verification) | SDK |
| Session invalidation | ⚠️ Logout is client-local; `revokeRefreshTokens` never called on admin revocation — deleted registry docs don't kill claim-based sessions | grep: 0 hits |
| Session fixation | ✅ N/A (token model, no server sessions) | — |
| Email/OTP verification | ❌ **Disabled by documented choice; no verification gate on anything** (V-01, V-07) | PROJECT_PLAN §5; grep 0 hits |
| Token reuse/brute-force | ✅ N/A (no custom tokens) | — |
| Auth bypass via direct API | ✅ Callables all guard before data access (verified all 28); rules deny client paths | stream reports |
| Privilege escalation (vertical) | ⚠️ Registry poisoning: grant an email → whoever *registers* it first (unverified!) becomes Firestore-admin (V-07). Clients cannot mint claims/self-grant (`admins` create = claims-super only, rules:365) | firestore.rules:27-41 |
| Horizontal (IDOR/BOLA) | ✅ voters/students self-scoped by uid/token.email; ballots unreachable; callable outputs aggregated | rules matrix |
| Manipulated electionId/candidateId | ⚠️ Accepted uncapped but resolved server-side against DB truth; forged IDs yield precondition failures, not access (V-13 residual) | ballotLogic.js |

---

## Deliverable 4 — Voting-Flow Integrity Audit

Flow: `/vote` → client checks (UX, fail-open by design, `rosterStatus.ts:14-16`) → `submitBallot` callable:

1. auth required (`index.js:104`) + App Check enforced
2. transaction: re-read election (`status==='open'`, `!locked`) + voter doc (`index.js:116-122`)
3. profile validation (`validateVoterProfile`: eligible, not-voted, email/studentNo regex, year/section types)
4. **roster binding inside tx** (`resolveRosterRecord`): `students/{studentNo}` wins; else unique name+section+year match
5. eligibility cross-check incl. roster email/section/year agreement (`rosterLogic.validateRosterEligibility`)
6. ballot validation against positions/candidates snapshot (`ballotLogic.validateBallot`)
7. atomic write: anonymous ballots + participation lock

**Integrity conclusions:** voter cannot choose election/position/candidate arbitrarily (all resolved server-side); cannot exceed one submission (lock in same tx, replay returns `already-exists`); cannot touch totals (no path). **Holes:** identity proof (V-01), candidate mutability mid-election (V-04), snapshot race (V-10). Vote timestamps: server-set on lock; ballots timestamp-free (by design, privacy).

---

## Deliverable 5 — Database Integrity Audit

(SQL/SQLite items map to Firestore equivalents.)

| Item | Finding |
|---|---|
| Injection | ✅ N/A — SDK-parameterized; no query-string composition from user input |
| Permissions | ⚠️ Rules strong on ballots/tallies/students/admins/config; **overly broad on elections/positions/candidates** (V-02/V-04) |
| Constraints/uniqueness | ⚠️ No DB-level uniqueness on `students/{no}` vs `studentIndex` for the *non-guest* self-registration path (guest path has `getAfter` cross-checks; student path has none) → squatting enabler (V-01) |
| Referential integrity | ⚠️ Enforced procedurally, not declaratively: orphan detection exists post-hoc (`doctorLogic`), but nothing prevents candidate deletion under live ballots (V-04/V-10) |
| Transactions/atomicity | ✅ Vote path atomic; ⚠️ publish/finalize/reset/backup pipelines non-transactional (Deliverable 9) |
| Corruption scenarios | Candidate edits under votes; resets on open elections; partial restores (V-06, V-14) |
| Accidental deletion | Confirmation phrase for nuke; backup-before-reset required for scoped reset ✅; `deletePosition` refuses under references ✅ |
| File exposure (SQLite `.db` analog) | ✅ No DB files in static export; `out/` scan clean; debug logs untracked |

---

## Deliverable 6 — Ballot Privacy Analysis

**Privacy model (documented):** ballots are unlinkable by construction — random doc IDs, no uid, no timestamp; participation (`hasVoted`/`votedAt`) lives on the voter doc; tallies aggregate only. No `voter_id → candidate_id` edge exists in any write path, backup, export, or log. Client access to `ballots/` is universally denied; even admins receive aggregates only (`getResults`, `publishTally` comment: "admins never receive individual ballot documents").

Residual links (acceptable, disclosed):
- Participation timing per voter is readable by admins (`voters/{uid}.votedAt`) — reveals *whether/when*, never *whom*.
- Backups contain `participation[{uid, votedAt}]` + anonymous ballots in one blob — still no choice linkage (V-14 covers confidentiality of that blob).
- Coercion-window caveat: anonymity is statistical, not cryptographic; out of code scope.

**Verdict:** secret-ballot requirement ✅ satisfied at every layer reviewed.

---

## Deliverable 7 — Admin Security Audit

- Two admin tiers: superadmin (claims-only) ≈ System Administrator; admin (claims ∨ registry) ≈ combined Election/Candidate/Voter Manager. **Finer role separation (results-viewer etc.) does not exist**; every ordinary admin can read the full roster, all audit entries, and trigger `importCandidates`/`deleteRosterEntries`.
- High-impact action protections: resets require exact phrase / fresh-backup proofs ✅; lock/finalize/archived gates exist in callables ✅; **but open/close/publish are unguarded client `updateDoc`s** (V-02) and publish lacks server audit (V-11). Re-authentication for sensitive actions: absent (recommend for finalize/reset/publish).
- Admin account lifecycle: creation rollback-safe ✅; **revocation gap** — registry delete doesn't invalidate claims or active tokens (V-07/Deliverable 11 recs).
- Registry admins have Firestore powers but no Storage write rights (claims-only `storage.rules:9-17`) — asymmetry causes operational failures, not escalation.

---

## Deliverable 8 — Abuse & Rate-Limit Strategy

Implemented (this cycle): App Check enforcement on all three student-facing callables; `minInstances: 1` on vote path; tally hot-doc removed (surge safety). Remaining strategy, per-operation:

| Surface | Limit mechanism | Status |
|---|---|---|
| Login/signup/password-reset | Firebase Auth built-in throttling | ✅ inherent; monitor via IAM audit logs |
| OTP/verification | N/A (feature disabled — see V-01 policy decision) | — |
| verifyStudentAgainstRoster (pre-auth) | App Check + (rec) input length caps + (rec) console enforcement | ◑ |
| submitBallot | App Check + auth + one-vote tx lock + minInstances | ✅ |
| getResults / admin callables | admin role gate; (rec) App Check everywhere once tokens verified | ◑ |
| Firestore direct reads | (rec) enable App Check enforcement for Firestore in console | ☐ |
| Payload sizes | (rec) caps from V-13 | ☐ |
| Excel/CSV import | callable row-caps exist; (rec) client pre-caps to protect UX | ☐ |

Console prerequisites (blocking): Blaze plan, budget alert, reCAPTCHA v3 registration + site key env, enforcement flips (Functions → Firestore). Details: `docs/RATE_LIMIT_HARDENING.md`.

---

## Deliverable 9 — Concurrency & Race-Condition Analysis

| # | Scenario | Mechanism | Verdict |
|---|---|---|---|
| 1 | Concurrent duplicate submissions (multi-tab/device) | Same tx contends on voter doc; loser retries → `already-exists` | ✅ safe |
| 2 | Replay of successful vote request | Lock check inside tx → `already-exists`; idempotent outcome | ✅ safe (UI should map to friendly "vote recorded") |
| 3 | Election closes mid-submission | Status re-read inside tx; commit after close impossible unless reopened (then V-02 applies) | ✅ conditional |
| 4 | Candidate deleted between ballot-validation read and commit | Positions/candidates loaded **outside** tx (`index.js:110` vs `:115`) → orphan ballot possible; excluded from recounts silently | ⚠️ V-10 |
| 5 | Reset runs while students vote | `resetElectionData` has no lock/status gate; lock-clear batches race in-flight votes → double-vote window | ❌ V-06 |
| 6 | Publish races status flip | `publishTally` two separate writes, no tx → published tally can miss ballots | ⚠️ V-11 |
| 7 | Concurrent admin edits (candidates/positions/election) | Last-writer-wins via rules; no optimistic locking; combined with V-02/V-04 = silent config drift | ⚠️ covered by V-02/V-04 |
| 8 | Backup during voting | Independent parallel queries → self-inconsistent artifact | ⚠️ V-14 |
| 9 | Restore midway failure | Batch pipeline abort leaves partial restore (e.g., locks missing) | ⚠️ V-14 |
| 10 | Concurrent logins/account updates | Stateless tokens; Firestore last-write-wins on profile | ✅ acceptable |

---

## Deliverable 10 — Backup & Disaster Recovery Plan

Current mechanics: superadmin-only `createBackup` → single JSON (schemaVersion, sha256) in Storage `backups/{id}.json` + metadata doc; `restoreBackup(overwrite?)` merges/upserts; scoped reset demands fresh matching backup. Gaps → V-14. Target plan:

1. **Frequency:** automatic backup at every state transition (open→closed, pre-publish, pre-finalize) in addition to manual/pre-reset.
2. **Retention:** keep ≥3 generations per election + 90 days; lifecycle rule on bucket prefix.
3. **Encryption:** rely on Google-managed at-rest keys (acceptable given anonymity) — document; optionally CMEK if policy demands.
4. **Access:** superadmin-only ✅ (keep); add Storage access logging.
5. **Restore procedure & testing:** add validate-only mode; **quarterly + pre-election restore drill into a scratch project**, comparing recomputed tallies vs source (`verifyLogic` reuse). *A backup never restored is not a backup.*
6. **DR roles:** superadmin executes; second person verifies checksum + counts; record drill in audit log.

---

## Deliverable 11 — Logging & Monitoring Strategy

Inventory today: server `writeAudit` for 21 privileged actions (failures **silently swallowed** — `audit.js:21-23`); client-authored entries for UI-driven mutations (forgeable content, V-12); **zero** auth-event logging; no metrics/alerting.

Plan:
1. Move open/close/publish (and any rules-level mutation you retain) behind audited callables; make audit failures fail the operation (or queue-retry).
2. Tighten `validAuditCreate` to `hasOnly` + bounded `action` enum + drop client `actorRole` (server derives).
3. Enable Google Cloud audit logs (IAM + Data Access for Firestore/Auth) → export to BigQuery; alert on: failed-login bursts, callable error-rate spike, 4xx surge on callables, election-doc writes outside callables, budget thresholds.
4. Election-day dashboard: function invocations/errors, Firestore ops/min, Auth actives; page the committee channel.
5. Never log ballot content (current design complies — keep).

---

## Deliverable 12 — Red-Team Test Plan (attacker = ordinary voter)

| # | Attempt | Expected (by design) | Static verdict | Evidence |
|---|---|---|---|---|
| 1 | Vote twice | 2nd → `already-exists` | ✅ holds | index.js:121-123, tx lock |
| 2 | Vote after close (`status:'closed'`) | `failed-precondition` | ✅ unless attacker is admin (V-02) | index.js:117 |
| 3 | Vote before open | same | ✅ same caveat | index.js:117 |
| 4 | Invalid/foreign candidate ID | `invalid-argument`/`permission-denied` | ✅ | ballotLogic.js:30-46 |
| 5 | Vote on behalf of another voter | Impossible via API (own uid only)… **unless impersonating registration first** | ❌ V-01 path | rules:297 |
| 6 | Read another user's data | denied | ✅ | rules:296,320 |
| 7 | Call admin APIs | denied | ✅ guards on all 28 | Deliverable 2 |
| 8 | Modify others' data | denied | ✅ within current rules; see admin-side V-02/V-04 | — |
| 9 | Replay captured request | idempotent denial | ✅ | #1 |
| 10 | 50 parallel submissions | exactly one commit | ✅ [DYNAMIC-PENDING] | tx semantics |
| 11 | Change IDs in requests | resolved server-side | ✅ | ballotLogic |
| 12 | Manipulate/remove frontend gating | no effect (server re-validates) | ✅ | Deliverable 4 |
| 13 | Bypass UI, raw curl/Postman | needs valid ID token **+ App Check token** (post-enforcement) | ✅ ◑ console flips required | init.ts, callables |
| 14 | Reset another user's account | no such endpoint for voters; superadmin tools only | ✅ | — |
| 15 | Modify results | ballots untouchable; tallies write=false | ✅ | rules:342-350 |
| 16 | Access DB files | no downloadable store; static export clean | ✅ | stream 3/4 |
| 17 | Extract sensitive info | aggregates only; ⚠️ raw error passthrough in admin UI | ◑ V-19 | adminErrors.ts:17 |
| 18 | Abuse password reset | N/A (no flow) — recovery = committee manual | ◑ process gap | — |
| 19 | Abuse OTP/verification | N/A (none exists — root cause of V-01) | ❌ design | — |
| 20 | Resource exhaustion | App Check + caps partial; selections/arrays uncapped | ⚠️ V-13 | index.js:108 |

---

## Deliverable 13 — Vulnerability Register

Format per spec: Problem / Attack / Impact / Root cause / Fix / Location / Verification / Priority.

### V-01 · CRITICAL — Voter impersonation & identity squatting (no proof-of-ownership)
- **Problem:** Registration requires only a well-formed email string + 7-9 digit number + name/section. Nothing proves the registrant controls the mailbox or *is* the student; `validVoterCreate` performs no roster/index uniqueness check (guest path does, student path doesn't).
- **Attack:** Attacker learns target's name/section/class (public knowledge) → derives `<name>.scc@gmail.com` → registers Auth account with that email (no verification needed) + target's `studentNo` → binds `studentIndex/{no}` to self → passes every submitBallot check → casts the target's ballot; target permanently blocked (index conflict). First-comer wins.
- **Impact:** Stolen votes (secret-ballot breach), disenfranchisement, unverifiable after the fact.
- **Root cause:** Deliberate "no email verification (fast-paced voting)" tradeoff without a compensating proof-of-identity control on the self-registration path.
- **Fix (choose, committee decision):** (a) enable Firebase email-verification and gate `validVoterCreate` on `request.auth.token.email_verified == true` (+ verify link TTL defaults), or (b) switch to roster-preprovisioned accounts (committee imports → one-time passwords), or (c) minimum hardening: extend `validVoterCreate` with `getAfter(studentIndex/{studentNo}).uid == uid` + roster-membership + exact roster email match (blocks squatting *only if* paired with email verification, else attacker still owns the mailbox-format). Recommend (a)+(c).
- **Location:** `firestore.rules:120-151` (`validVoterCreate`), `lib/auth/authService.ts:28-82`, console Auth settings.
- **Verification:** Rules-unit test: second registration claiming same studentNo w/o index ownership → denied; verified-email off → registration denied. [DYNAMIC-PENDING]
- **Priority:** P0 — decide before any registration opens.

### V-02 · CRITICAL — Election state machine unenforced; elections mass-assignment via rules
- **Problem:** `elections` create/update rules check only *who*, never *what*. Any admin can write any field: `status` (any value incl. `published`/`finalized`), `locked`, `openAt/closeAt`, `positions`, `registrationOpen`. No callable exists for open/close; UI uses raw `updateDoc` (`adminData.ts:199-207`).
- **Attack:** Compromised/malicious admin (or stolen session): `published→open` reopens voting after results release (old+new ballots pool on next recompute); sets `status:'published'` pre-close to leak candidates/tallies publicly (rules:290,347 key off status); flips `registrationOpen` mid-lock.
- **Impact:** Total election-integrity compromise; silent, no server audit.
- **Root cause:** Rules express only lock/finalize guards; state transitions were never centralized.
- **Fix:** Add `setElectionStatus`/`configureElectionWindow` callables enforcing a transition table (`draft→open→closed→published→finalized→archived`, reopen forbidden or superadmin+audited+backup-gated), forbid `published→open`, require tally presence for `closed→published`, and reduce rules to `update: if false` (callables only) for elections.
- **Location:** `firestore.rules:270-280`; new callable in `electionOps.js`; replace `setElectionStatus` client fn.
- **Verification:** Rules tests: admin `status:'open'` on closed doc → denied; callable matrix test for every illegal transition. [DYNAMIC-PENDING]
- **Priority:** P0.

### V-03 · CRITICAL (functional, verify prod) — Self-registration writes a rules-forbidden field
- **Problem:** `registerStudent` persists `electionsRegistered:{[eid]:true}` on `voters/{uid}`; `validVoterCreate.hasOnly([...])` excludes it → **every student registration is denied by deployed rules** (if repo rules = deployed rules).
- **Attack:** n/a (availability bug, not exploit) — but it also means the system may never have been exercised end-to-end against current rules.
- **Impact:** Registration outage at launch.
- **Root cause:** Client/rules drift.
- **Fix:** Drop the field from `authService.ts:60-62` (participation is derived from `hasVoted`, and election scoping exists elsewhere) **or** whitelist it deliberately; then run emulator E2E registration.
- **Verification:** Emulator script: register → expect `voters/{uid}` exists. [DYNAMIC-PENDING]
- **Priority:** P0 (launch blocker triage).

### V-04 · HIGH — Candidates mutable during live voting (incl. delete ⇒ silent vote loss)
- **Problem:** Rules permit admin CUD on candidates until lock/finalize; update guard evaluates the *old* `electionId` so candidates can be re-pointed to another election; client `deleteCandidate` works mid-vote; `importCandidates` has no ballot-count guard.
- **Attack:** Admin deletes/re-keys a candidate after votes cast → orphan ballots (`doctorLogic:128-134` flags post-hoc) silently excluded from recomputed tallies; renaming/swapping `photoURL`/`yearLevel` corrupts attribution of counted ballots.
- **Impact:** Undetectable alteration/loss of recorded votes.
- **Root cause:** Same dual-path weakness as V-02; no "votes exist ⇒ freeze candidates" predicate.
- **Fix:** Gate `candidateWritable` on `ballotsFor(election)==0` (rules can't count cheaply → move candidate CUD to guarded callables with ballot-count preconditions; keep rules write:false). Deletion only via archival (`active:false`).
- **Location:** rules:289-293; `candidateOps.js`; `adminData.ts:151-211`.
- **Verification:** Callable rejects candidate delete/import when ballots>0; rules test write:false. 
- **Priority:** P1.

### V-05 · HIGH — `openAt`/`closeAt` stored but never enforced
- **Problem/Impact:** Voting window exists only as data; a forgotten manual close keeps polls open indefinitely (and `openAt` doesn't prevent early voting). Boundary requests honored purely by human timing.
- **Attack:** None needed — negligence suffices; insider can also delay closing.
- **Root cause:** No schedule evaluation anywhere (`grep schedule/pubsub` = 0; submitBallot checks status only, `index.js:117`).
- **Fix:** Inside the submitBallot transaction, when `openAt/closeAt` are non-null compare against `FieldValue.serverTimestamp()`-derived now (reject outside window); optionally a scheduled sweep to auto-flip status at `closeAt` as belt-and-braces.
- **Location:** `index.js:115-122`; optional new scheduled function.
- **Verification:** Unit test with mocked clock: vote at closeAt+1s → denied; boundary semantics documented (UTC Timestamps; DST-free).
- **Priority:** P1.

### V-06 · HIGH — Resets runnable on an open election; `unlockElection` ungated
- **Problem/Impact:** `resetAllElectionData` blocks only `locked`; `resetElectionData` checks neither lock nor status; lock-clear batching races live votes (double-vote window); `unlockElection` has zero preconditions.
- **Attack:** Insider resets mid-election-day ("cleanup") wiping ballots/locks/accounts.
- **Root cause:** Missing status preconditions.
- **Fix:** Require `status ∈ {draft,closed}` ∧ `locked===true` for both resets; require explicit `fromStatus` for unlock; refuse when ballots>0 except `ballots`/`full` scopes with fresh backup (already partly there).
- **Location:** `electionOps.js:139-156, 339-441, 281-288`.
- **Verification:** Callable tests: open+unlocked → rejected.
- **Priority:** P1.

### V-07 · HIGH — Admin authorization trusts unverified emails; revocation incomplete
- **Problem:** `isRegistryAdmin`/`assertAdmin` never check `email_verified`; granting `admins/{x@scc…}` lets whoever registers that address first inherit Firestore-admin. Registry deletion doesn't revoke claim-based admins or live tokens.
- **Attack:** Superadmin grants `dean.scc@gmail.com` before the dean's account exists → student registers that email first → admin rights over voters/roster/audit (not super tier).
- **Root cause:** Email-as-identity without proof-of-control; claims/registry duality without reconciliation.
- **Fix:** Require `request.auth.token.email_verified == true` in `isRegistryAdmin()` + `assertAdmin` registry branch; standardize on **claims-only** for admins (registry = provisioning aid only); call `revokeRefreshTokens(uid)` on revocation; prefer `createAdminAccount` (provisions the Auth user atomically) over bare registry grants.
- **Location:** `firestore.rules:27-30`, `authGuards.js:25-35`, revocation in `superadminData.ts` revoke path.
- **Verification:** Rules test: unverified-token context + existing admins doc → denied.
- **Priority:** P1.

### V-08 · HIGH — Vulnerable parser `xlsx@0.18.5` (direct dep)
- **Problem:** Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9); npm line EOL, **no fix available**; used to parse admin-supplied rosters client-side; no client row/file caps.
- **Impact:** Malicious workbook DoSes the importing admin's tab; prototype pollution in a privileged page context.
- **Fix:** Replace with SheetJS CDN build ≥0.20.2 vendored locally, or migrate parsing server-side (callable already re-validates; consider uploading file → parse in function with `fast-xml-parser` chain patched). Add client caps (≤MAX_ROSTER_ROWS rows, ≤5 MB).
- **Location:** `voting-app/package.json:23`, `lib/admin/rosterImport.ts`.
- **Verification:** `npm audit` clean for direct deps; poisoned-sheet fixture rejected.
- **Priority:** P1.

### V-09 · HIGH — Real PII & credential artifacts committed to the repo
- **Problem:** Tracked in git (remotes exist: origin, collaborator): `testing-reports/chrome-temp/**` (Chrome profile with Cookies/Login Data), voter CSV exports (`retest2-voters*.csv`: fullName/studentNo/email), `BSCS SECTIONING 26-27.xlsx` (AY26-27 masterlist), plus 936 testing-reports files; `admin-app/.env` (may embed SA JSON copy) sits untracked-but-unignored in-tree; SA private-key JSON lives in repo root (correctly untracked, but in-tree).
- **Impact:** Classmate PII leakage via any push/collab; potential credential material in history forever.
- **Fix:** `git rm -r --cached` the above; extend `.gitignore` (`testing-reports/`, `audits/` media, `*.xlsx`, `admin-app/`); **rotate any passwords found in chrome-temp**; history rewrite (`git filter-repo`) + force-push coordination since remotes exist; move SA JSON + `admin-app/.env` outside the tree (or vault).
- **Location:** repo root, `.gitignore`, `testing-reports/`, `BSCS SECTIONING 26-27.xlsx`.
- **Verification:** `git ls-files | Select-String 'csv|xlsx|chrome-temp'` empty; history scan clean.
- **Priority:** P1.

### V-10 · MEDIUM — Ballot validation snapshot read outside the vote transaction
- **Problem/Attack/Impact:** `loadPositionsAndCandidates` runs pre-tx (`index.js:110` vs `:115`); a candidate legally mutated in that instant (V-04) yields committed orphan ballots — silent loss at recount.
- **Root cause:** Throughput-driven design choice (cheaper reads), legitimate concurrent mutation path.
- **Fix:** After V-04 freezes candidates during voting, this collapses to benign staleness; alternatively re-validate referenced candidates inside the tx (2 extra reads).
- **Location:** `index.js:110`.
- **Verification:** Interleaving test with frozen-candidate rules → no orphans possible.
- **Priority:** P2 (after V-04).

### V-11 · MEDIUM — `publishTally` non-transactional and unpublished server-side
- **Problem:** Two independent writes (tally, status) with no tx and no `writeAudit`; the official publish event exists only as a client-authored log entry.
- **Attack/Impact:** Mid-publish reopen (via V-02) publishes short tallies; dispute trail is forgeable.
- **Fix:** Wrap in transaction + `writeAudit('election.publish')`; block if `updatedAt < lastBallotCommit` sanity check.
- **Location:** `index.js:574-606`; remove client-side audit dup (`adminData.ts:232`).
- **Verification:** Unit test interleaving; audit entry asserted server-authored.
- **Priority:** P2.

### V-12 · MEDIUM — Audit trail partially forgeable / lossy
- **Problem:** `validAuditCreate` uses `hasAll` (extra keys pass); `details`/`action`/`actorRole` free-form (clients claim `superadmin`); `writeAudit` swallows failures; raw-SDK mutations (the V-02/V-04 paths) generate **no** audit at all.
- **Fix:** `hasOnly` + enum-bound `action` + size-capped `details`; server-derived role; audit-on-failure policy; move all sensitive mutations to callables (V-02/V-04 fixes carry this).
- **Location:** rules:244-249, `audit.js:21-23`, client `createAudit` callsites.
- **Verification:** Rules test rejecting unknown keys/oversized details; chaos-test audit outage fails the op.
- **Priority:** P2.

### V-13 · MEDIUM — Input-size/shape hardening gaps across callables
- **Items:** `selections` object unbounded keys/depth (`index.js:108`); `positions[]`/`eligibleSections[]`/repair `ids[]` uncapped; `title`/names no max-length; `metadata` accepts arrays in `createElection` (rejected in `updateElection` — inconsistent); `parseDate` silently nulls malformed dates (typo erases a configured close time); `electionId` params never length/format-capped; `MAX_BACKUP_BYTES` dead constant.
- **Impact:** Cost/DoS nuisance (App Check mitigates), data-quality corruption via silent nulls.
- **Fix:** Central `assertString(v,{max})`/`assertArray(v,{maxItems,itemMax})` helpers; cap selections keys at `positions.length`; reject unknown metadata arrays; make `parseDate` throw on garbage; wire the backup byte-cap.
- **Location:** `index.js`, `electionOps.js`, `tally.js:46-59`, `doctorOps.js:60`, `constants.js:15`.
- **Verification:** Per-callable negative unit tests (oversize/garbage inputs → `invalid-argument`).
- **Priority:** P2.

### V-14 · MEDIUM — Backup confidentiality/atomicity/testing gaps
- **Problem:** Plaintext blob w/ participation PII (default at-rest encryption only); non-atomic parallel-query snapshot; `restoreBackup` partial-failure hazard; no dry-run; size cap dead; restore never rehearsed.
- **Fix:** Adopt Deliverable-10 plan (transition-triggered backups, retention/lifecycle rules, validate-only mode, documented quarterly restore drill into scratch project, wire `MAX_BACKUP_BYTES`).
- **Location:** `backupOps.js`, `backupLogic.js`.
- **Verification:** Drill log: scratch-project restore → `verifyLogic` green vs source.
- **Priority:** P2.

### V-15 · MEDIUM — Dependency advisory backlog
- **Items:** functions: `fast-xml-parser` high (fixable), `uuid`/google-chain needs `firebase-admin@14`; rules-tests: `undici` pile; app: `firebase@10` → v12 major (also unlocks newer undici).
- **Fix:** Now: `npm audit fix` safe sets (fast-xml-parser). Scheduled: majors upgrade sprint post-election; pin & re-audit in CI.
- **Verification:** `npm audit` counts → target 0 high (prod deps).
- **Priority:** P2 (P1 item for `xlsx` already split out as V-08).

### V-16 · LOW — Headers/CSP
- **Problem:** No `Content-Security-Policy` (hosting headers lack it); `X-Powered-By` not disabled; static export means host-supplied headers only.
- **Fix:** Add CSP via `firebase.json` hosting headers (start Report-Only; Next inline scripts need `'unsafe-inline'` pragmas or nonces via CDN rewrites — tune iteratively); `poweredByHeader:false` (note: inert under `output:export` but harmless); add frame-ancestors 'self'.
- **Verification:** securityheaders.com scan on prod URL.
- **Priority:** P3.

### V-17 · LOW — Storage photo surface
- **Problem:** Download URLs (unguessable-token, long-lived) stored on candidate docs bypass the signed-in read rule if leaked; `contentType` is client-asserted prefix-match (no magic bytes).
- **Impact:** Photo scraping; junk-content upload by a malicious admin only (writes are admin-claimed).
- **Fix:** Prefer signed GETs via callable or accept residual risk publicly documented; server-side sniff (fn-based upload) if pursued.
- **Priority:** P3.

### V-18 · LOW — Validation odds & ends
- `fullName`/`section` accept any type/value in voter rules (React escaping prevents XSS; garbage data possible); guest-create path is unsatisfiable by current client (`loginGuest` omits required fields) = dead code behind a fail-closed flag; `assertElectionConfigWritable` succeeds when election doc missing (`authGuards.js:58`); `studentIndex/emailIndex` admin-deletes not lock-gated.
- **Fix:** Type/length checks in validators; delete or complete the guest path; fail-closed on missing election doc.
- **Priority:** P3.

### V-19 · LOW — Info leakage via error text
- Admin console renders raw provider messages (`friendlyAdminError` fallthrough, `adminErrors.ts:17`; multiple panels); signup `email-already-exists` enables enumeration (inherent).
- **Fix:** Map unknown codes to generic copy; keep enumeration tradeoff documented (accept).
- **Priority:** P3.

### V-20 · INFORMATIONAL — Platform notes
- CSRF: bearer-ID-token model, no cookies for API auth → classic CSRF N/A (Auth cookie flows internal to Google). CORS: callable defaults acceptable given authn+AppCheck. Sessions: IndexedDB-stored Firebase tokens; add `revokeRefreshTokens` on compromise/revocation. HTTPS/HSTS ✅ (hosting headers). Time: store/consume `openAt/closeAt` as UTC Timestamps only (ties to V-05). Ties in results have no special handling (display-only concern; document committee tie-break rule).

---

## Deliverable 14 — Prioritized Remediation Roadmap

| Wave | Items | Theme |
|---|---|---|
| **P0 — before registration opens** | V-03 verify/fix registration-vs-rules drift; V-01 identity decision + rules; V-02 state-machine callables + rules lockdown | Launch blockers |
| **P1 — before voting opens** | V-04 candidate freeze-under-votes; V-05 time-window enforcement; V-06 reset/unlock gates; V-07 email_verified + revocation; V-08 xlsx replacement; V-09 repo PII purge + rotation | Integrity & hygiene |
| **P2 — election week** | V-10..V-15 (snapshot revalidation, publish tx+audit, audit hardening, input caps, backup drills, dep upgrades) | Hardening |
| **P3 — post-election** | V-16..V-19 polish; V-20 documentation | Maintenance |

Sequencing note: V-02/V-04 rule tightenings shrink the direct-write surface, which automatically retires most of V-12's raw-SDK blind spots — implement those two first.

---

## Deliverable 15 — Production Deployment Security Checklist

1. ☐ V-03 confirmed fixed: emulator E2E registration green against **deployed** rules
2. ☐ V-01 identity model decided & implemented (email-verified gate or preprovisioned creds)
3. ☐ V-02/V-04/V-06 callables deployed; rules tightened (`elections/candidates` client-writes = false); rules-test suite extended & green
4. ☐ V-05 window enforcement live; `closeAt` set; auto-close sweep scheduled
5. ☐ V-07: all admin accounts created via `createAdminAccount` (verified emails), claims standardized, revocation runbook includes `revokeRefreshTokens`
6. ☐ App Check: reCAPTCHA v3 registered; `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` set; Functions + Firestore enforcement ON (monitor→enforce)
7. ☐ Blaze plan active; budget alert firing correctly
8. ☐ V-09: repo purged (PII/chrome-profile/xlsx), history rewritten, secrets rotated, `.gitignore` extended
9. ☐ V-08: xlsx replaced/vendored; `npm audit` 0 high in prod deps
10. ☐ Backup: pre-open manual backup taken, checksum logged; restore drill completed in scratch project
11. ☐ Monitoring: Cloud audit-log exports + alerts wired; committee escalation channel defined
12. ☐ Load test: ≥2× expected peak concurrent submits against staging (hotspot fix verified under load) [DYNAMIC-PENDING]
13. ☐ Red-team pass executed on staging (Deliverable 12 matrix, esp. items 1-5,10,13) with recorded expected/actual
14. ☐ Go-live checklist (`docs/go-live-checklist.md`) re-run end-to-end after the above changes
15. ☐ Committee sign-off recorded in audit log (`election.open` via new audited callable)

---

*Evidence base: four parallel code-review streams (Functions deep-dive, Rules/Data-model, Frontend surface, Repo/dependencies) conducted 2026-08-23; all file:line citations preserved in-stream. Items marked [DYNAMIC-PENDING] require staged/runtime execution to convert static assurance into demonstrated assurance.*
