# CSS Department Voting System — Production Readiness Gap Analysis

Date: 2026-07-12  
Scope: repository at `/workspaces/CSS-Department-Voting-System`  
Reviewer mode: source, rules, tests, build, dependency, and operational-document review

> **Resolution addendum (2026-07-12, post-audit).** The Phase 0 election-integrity
> blockers have since been closed by a Cloud Functions rewrite (commit "Cast, tally,
> and publish ballots through trusted Cloud Functions"):
> - **C-01 (secret ballot)** — RESOLVED. Ballots now live in `ballots/{randomId}`
>   with no uid and no timestamp; security rules deny all client (and admin) reads
>   and writes. Admins see only server-aggregated counts via the `getResults`
>   function. Verified by direct Firestore inspection in E2E: 17 stored ballots,
>   none carrying identity.
> - **C-02 (all-at-once ballot)** — RESOLVED. Submission is a single server-side
>   transaction in `submitBallot`; a partial or direct client write is impossible
>   (clients cannot write `ballots` at all).
> - **C-03 (forged participation)** — RESOLVED. The `hasVoted`/`votedAt` lock is
>   set only by the function; rules deny client writes to those fields.
> - **C-04 (guest abuse)** — MITIGATED, not fully resolved. Guest voting is
>   fail-closed and superadmin-gated; rate-limiting/App Check (H-07) remain open.
>
> Remaining items below (H-05, H-07–H-13, most M/L findings, operations) are
> still open and unaffected by this addendum. Blaze plan is now required.

## Evidence and limits

Verified commands:

- `voting-app`: `npm test` — 9 files, 59 tests passed.
- `voting-app`: `npx tsc --noEmit` — passed.
- `voting-app`: `npm run lint` — passed with 7 `@next/next/no-img-element` warnings.
- `voting-app`: `npm run build` — passed; static routes generated for `/`, `/admin`, `/dashboard`, `/results`, `/superadmin`, and `/vote`.
- `firebase/rules-tests`: default `npm test` under Auth/Firestore/Storage emulators — passed (`firestore.rules.test.js`, phase 7, and Storage).
- Explicit phase-suite run — failed at `test:phase2` because `phase2.auth.test.js` imports the missing `web/src/auth/guards-core.js`; phase 3/4/6 were not reached.
- `npm audit --omit=dev` in `voting-app` — 12 advisories: 2 high, 10 moderate.
- `npm audit` in `voting-app` — 20 advisories: 5 high, 15 moderate.
- `npm audit` in `firebase/rules-tests` — 18 advisories: 1 high, 17 moderate.

No source changes were made for this audit. The four pre-existing modified files were preserved. Fresh browser screenshots were not captured because no browser-control tool was available in this session; visual findings below are therefore source-based and must be confirmed with a current keyboard/mobile/assistive-technology run. Existing screenshots and prior reports were not treated as current visual evidence.

## Executive summary

The project is a working static Next.js/Firebase prototype with a credible happy path and unusually good baseline rule-test coverage. It is not yet production-ready for a real election. The primary blockers are election-integrity and privacy design issues, not compilation:

1. Firestore rules allow a voter to create an individual valid vote without proving that the complete ballot and voter lock are committed together.
2. Voters can directly edit their own `hasVoted` and `votedAt` maps, including marking themselves as voted without a ballot.
3. Vote records contain the voter UID and are readable by every admin; this contradicts the stated secret-ballot promise and makes vote-to-person tracing possible.
4. Anonymous guest voting accepts an unverified email-shaped string, with no rate limit, CAPTCHA, device/session abuse control, or verified identity proof.
5. Candidate records and election state remain mutable by client-side admins during the election, and admin mutations plus audit entries are separate writes.
6. There is no deployed server/API layer, Cloud Functions layer, or the planned Python Admin SDK application. All privileged workflows are browser writes governed by broad rules.

The codebase earns a production-readiness score of **41/100**: strong prototype foundations and a passing default rules suite, but below the minimum threshold for a trustworthy public election because core integrity, secrecy, abuse resistance, privacy governance, and operations are incomplete.

## Critical blockers before launch

### C-01 — Secret ballot is not actually secret from admins

- Category: Security / privacy / election integrity
- Finding: `votes/{voteId}` stores `uid`, and Firestore grants `allow read: if isAdmin()` for the entire votes collection. The vote ID itself is deterministic and includes the UID. The landing page promises that admins cannot trace a ballot to a student.
- Current state: `firebase/firestore.rules:383-387`; `voting-app/lib/types.ts:41-49`; `voting-app/lib/student/voteSubmit.ts:8-10`; admin subscriptions in `voting-app/lib/admin/adminData.ts:34-50`.
- Why it matters: Any admin or compromised admin account can query votes and join `uid` to `voters/{uid}`. This exposes individual choices and undermines voter trust and election confidentiality.
- Risk or impact: Direct voter deanonymization, coercion, retaliation, loss of election validity, and privacy incident.
- Severity: Critical
- Affected users or roles: All voters; admins; election committee.
- Affected files/modules/pages: Firestore rules; vote schema; admin console Results/Overview; landing secret-ballot copy.
- Recommended solution: Introduce a trusted vote-ingestion/tally boundary. Keep voter identity and one-vote eligibility in a restricted transaction/lock store; write ballot records with random non-identifying IDs and deny browser/admin reads of raw ballots. Expose only aggregate tallies and participation counts to admins. Define who, if anyone, may access identity-bearing records under a documented break-glass process.
- Dependencies: Cloud Functions or another trusted backend; migration of current vote schema; privacy/legal review; new secrecy rules tests.
- Estimated complexity: Large
- Suggested implementation phase: Phase 0 launch blocker
- Verification criteria: An admin web token cannot read any individual vote; exported/admin data contains no UID-to-choice mapping; a published tally still matches an independent recomputation; privacy threat-model review is signed off.

### C-02 — “All-at-once” ballot is enforced only by the client

- Category: Security / backend / vote integrity
- Finding: `validVoteCreate()` validates one vote document at a time and checks only the existing `hasVoted` flag. It does not require all 17 required positions, nor does it require the voter lock update in the same commit. A malicious client can call `setDoc()` for one position directly.
- Current state: `firebase/firestore.rules:285-317`; the browser batch is assembled in `voting-app/lib/student/voteSubmit.ts:24-46`.
- Why it matters: The documented guarantee “no partial or top-up votes” is false at the trust boundary. A user can submit a partial ballot and later add more votes while the election remains open.
- Risk or impact: Inconsistent ballots, unequal voter behavior, tally disputes, and an integrity challenge that the current happy-path tests will not detect.
- Severity: Critical
- Affected users or roles: Voters, election committee, auditors.
- Affected files/modules/pages: Firestore vote rules; `voteSubmit`; phase 3/6 rules tests.
- Recommended solution: Move ballot submission to a callable/backend transaction that validates the election snapshot, voter eligibility, complete required-position set, candidate set, and one-time lock atomically. If rules-only enforcement is retained, add explicit `getAfter()` invariants and tests for every partial, split, reordered, and concurrent write path; a server function is preferable for maintainability and access-budget control.
- Dependencies: Trusted backend; election/position snapshot model; concurrency tests.
- Estimated complexity: Large
- Suggested implementation phase: Phase 0 launch blocker
- Verification criteria: Direct single-document writes fail; any incomplete batch fails with no documents committed; two concurrent complete submissions result in exactly one success; a complete submission creates exactly the configured ballot set and lock.

### C-03 — Voters can forge their own participation state

- Category: Security / authorization
- Finding: `validVoterVoteCompletionUpdate()` allows a voter to alter any `hasVoted`, `votedAt`, and `updatedAt` map values as long as the affected keys are limited to those map fields. It does not require a specific election key, true value, server timestamp for `votedAt`, or evidence that vote documents exist.
- Current state: `firebase/firestore.rules:200-212`; the normal client update is at `voting-app/lib/student/voteSubmit.ts:40-44`.
- Why it matters: A direct client can mark itself as voted without voting, reset an election flag, or write arbitrary timestamps/keys. This can deny a legitimate ballot or make client status disagree with immutable vote records.
- Risk or impact: Voter lockout, false turnout indicators, disputed participation records, and inconsistent recovery behavior.
- Severity: Critical
- Affected users or roles: Voters; admins relying on turnout; election auditors.
- Affected files/modules/pages: Firestore voter rules; dashboard; ballot guard; admin aggregation.
- Recommended solution: Remove voter-controlled completion updates. Only a trusted ballot transaction should set a narrowly defined immutable participation record, or use a rules invariant that permits one server-timestamped transition for the active election and no arbitrary map writes.
- Dependencies: C-02 backend transaction; schema decision for multi-election participation.
- Estimated complexity: Medium/Large
- Suggested implementation phase: Phase 0 launch blocker
- Verification criteria: Direct voter writes to `hasVoted`/`votedAt` fail; a successful ballot creates the only valid participation transition; forged true/false, extra-election, and client timestamp attempts are covered by rules tests.

### C-04 — Guest registration does not prove identity and is not abuse-resistant

- Category: Authentication / abuse prevention / privacy
- Finding: One-time voters use anonymous Firebase Auth and submit only a name, section, year, and syntactically valid `.scc@gmail.com` string. No email verification, student number, CAPTCHA, rate limit, or device/session abuse control is present.
- Current state: `voting-app/lib/auth/authService.ts:44-79`; `firebase/firestore.rules:138-170`; `AuthCard` guest form at `components/auth/AuthCard.tsx:339-400`.
- Why it matters: Anyone can create repeated anonymous identities and claim arbitrary official-looking email strings. The `emailIndex` prevents reuse of one exact string, not identity fraud or aliases.
- Risk or impact: Ballot stuffing, turnout distortion, impersonation, denial of service against real emails, and potential student-data abuse.
- Severity: Critical while guest mode is enabled; High if disabled before launch
- Affected users or roles: Guest voters; all voters; election committee.
- Affected files/modules/pages: AuthCard; auth service; guest rules; app config.
- Recommended solution: Prefer verified institutional identity or admin-issued one-time codes. If guest mode is retained, add a server-side abuse service with rate limits, CAPTCHA/App Check, single-use signed invitations, audit/monitoring, and a clear identity policy. Fail closed when the abuse-control service is unavailable.
- Dependencies: Identity decision by the department; backend/Cloud Functions; App Check; privacy review.
- Estimated complexity: Large
- Suggested implementation phase: Phase 0 launch blocker
- Verification criteria: Automated abuse tests and a load test show bounded account/vote creation; an unverified arbitrary email cannot obtain a ballot; guest configuration fails closed during config/backend outage.

## High-priority findings

### H-01 — No trusted backend or planned desktop admin application exists

- Category: Architecture / operations
- Finding: `firebase/functions/.gitkeep` is the only Functions content, and `admin-app/` contains only `.env`. The README and PROJECT_PLAN describe a Python Admin SDK application and trusted privileged workflows that are not present.
- Current state: Static Next.js export plus Firebase client SDK; privileged operations live in `voting-app/lib/admin/adminData.ts` and `lib/superadmin/superadminData.ts`.
- Why it matters: There is no trusted place for atomic lifecycle transitions, rate limiting, secret-ballot ingestion, scheduled jobs, recomputation, incident controls, or server-side audit enforcement.
- Risk or impact: Broad client authority, partial writes, difficult recovery, and operational dependence on direct Firestore access.
- Severity: High
- Affected users or roles: Superadmins, admins, election committee, voters.
- Affected files/modules/pages: `firebase/functions`; `admin-app`; admin/superadmin data modules.
- Recommended solution: Choose one supported production architecture. Recommended: callable Functions/Cloud Run for privileged mutations and vote processing, with a separately secured operator tool if needed. Remove or explicitly archive the unimplemented Python plan rather than treating it as available.
- Dependencies: Hosting/runtime budget; service account/IAM design; deployment pipeline.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: No browser client can perform privileged lifecycle/tally/admin-account actions directly; backend endpoints enforce authz, validation, idempotency, audit, and transaction boundaries.

### H-02 — Lifecycle and candidate mutations are too broad and are not atomic with audit

- Category: Authorization / data integrity / audit
- Finding: Any admin may create, update, or delete any election, position, candidate, voter, or tally. Mutation and `createAudit()` are separate client writes, so either can succeed without the other. Rules do not validate election status transitions, candidate shape, or roster freeze.
- Current state: `firebase/firestore.rules:345-367,389-401`; operations in `voting-app/lib/admin/adminData.ts:112-235`.
- Why it matters: Direct Firestore calls can bypass the UI’s intended lifecycle, and audit completeness is not guaranteed. A candidate can be moved/deleted after votes exist.
- Risk or impact: Invalid published results, missing audit evidence, silent data corruption, and administrative disputes.
- Severity: High
- Affected users or roles: Admins, superadmins, voters, auditors.
- Affected files/modules/pages: Firestore rules; admin console Candidates/Lifecycle/Results.
- Recommended solution: Enforce explicit state-machine transitions server-side; freeze positions/candidate identity once voting opens; use soft delete/deactivation after votes exist; perform mutation plus audit in one trusted transaction/outbox flow; separate admin permissions from superadmin/root operations.
- Dependencies: H-01 backend; candidate/election versioning; audit schema.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: Invalid transitions and roster edits are rejected; post-vote delete/move attempts are rejected or become non-destructive deactivation; every accepted mutation has exactly one durable audit event.

### H-03 — Single-election assumptions conflict with the multi-election model

- Category: Backend / data model / product correctness
- Finding: Most writes and reads default to `ELECTION_ID`; candidate writes hardcode it, the admin UI manages the current election, dashboard/results copy 2026, and `publishElection()` calls `loadVotes()` without passing its `electionId` (`adminData.ts:199-215`). Superadmin lists elections but cannot create/archive them.
- Current state: `voting-app/lib/constants.ts`; `adminData.ts:112-142,199-210`; pages and landing content; `superadminData.ts` only renames/listens.
- Why it matters: A second election can publish an empty or wrong tally, and users can see hardcoded/current-election content rather than the selected cycle.
- Risk or impact: Wrong results, cross-election data leakage, broken archival, and irreversible operational mistakes.
- Severity: High
- Affected users or roles: Superadmins, admins, voters, auditors.
- Affected files/modules/pages: election repo; admin/superadmin pages; publish flow; seed/schema docs.
- Recommended solution: Make `electionId` an explicit route/context everywhere; pass it through every repository and mutation; add create/archive/restore rules and UI; version candidate and position snapshots per election; test two simultaneous elections.
- Dependencies: H-01; schema migration; route/product decision.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: Two seeded elections can be administered and published independently; each tally contains only its own votes; no hardcoded 2026 value controls a live operation.

### H-04 — Public pre-publication results state is broken for signed-out visitors

- Category: Product behavior / access control
- Finding: `loadPublicElection()` reads `elections/{id}`, but rules allow election reads only to signed-in users or after publication. Before publication, the signed-out `/results` page can fail before it reaches its designed “Not published yet” state.
- Current state: `firebase/firestore.rules:345-347`; `voting-app/lib/results/publicResults.ts:5-9,21-32`; `app/results/page.tsx:43-73`.
- Why it matters: A public visitor cannot reliably receive the expected locked state during the most common pre-publication period.
- Risk or impact: Confusing error experience, support load, and inconsistent disclosure of election state.
- Severity: High
- Affected users or roles: Signed-out students and public visitors.
- Affected files/modules/pages: Results page; election/candidate read rules.
- Recommended solution: Permit only the minimum public election metadata needed for a locked state, or make the page’s state independent of a protected read. Keep candidates/tallies private until publication.
- Dependencies: Public disclosure policy; rules tests for draft/open/closed/published.
- Estimated complexity: Small/Medium
- Suggested implementation phase: Phase 1
- Verification criteria: Signed-out draft/open/closed visitors see the locked state with no raw rules error; signed-out published visitors see only the published snapshot.

### H-05 — Authentication and account recovery are incomplete

- Category: Authentication / accessibility / support
- Finding: There is no password-reset, email-verification, account-recovery, account-deletion, or device/session management flow. The client accepts passwords of six characters (`validation.ts:19`) and uses `autoComplete="off"` for login/password fields (`AuthCard.tsx:204-245`).
- Current state: Email/password Auth plus anonymous Auth only; no recovery route or support workflow exists.
- Why it matters: Lost accounts cannot be recovered safely, password-manager use is impaired, and unverified email-shaped accounts can remain active.
- Risk or impact: Account lockout, support bypasses, credential reuse, and poor accessibility/usability.
- Severity: High
- Affected users or roles: Students, guests, admins, support staff.
- Affected files/modules/pages: AuthCard; auth service; validation; docs.
- Recommended solution: Add reset/recovery and explicit session policy; use password-manager-compatible autocomplete values; decide and document verification/SSO policy; enforce stronger server-side authentication policy and reauthentication for high-impact actions.
- Dependencies: Identity decision; email provider/SSO; support process.
- Estimated complexity: Medium/Large
- Suggested implementation phase: Phase 1
- Verification criteria: Recovery works end to end; expired/disabled accounts are handled; password managers can fill fields; sensitive admin actions require recent authentication or equivalent control.

### H-06 — Input and business-rule validation is incomplete at the trust boundary

- Category: Backend / security
- Finding: Voter rules validate email, student number, year, timestamps, and key names, but do not require non-empty/string `fullName` or `section`. Candidate, election, position, tally, and audit fields have little or no type/length/status validation. Admin UI validation is not a security boundary.
- Current state: `firebase/firestore.rules:100-130,138-170,326-343`; admin forms in `CandidatesPanel.tsx`.
- Why it matters: Direct clients can create malformed records, oversized text, invalid states, or data that breaks exports and reporting.
- Risk or impact: Data corruption, stored-content abuse, UI denial of service, and unreliable results.
- Severity: High
- Affected users or roles: All users; admins; auditors.
- Affected files/modules/pages: Firestore rules; admin forms; exports; results.
- Recommended solution: Centralize schema validation (e.g., backend DTO/schema), enforce lengths, allowed enums, ownership, cross-document invariants, and immutable fields. Reject unknown/oversized values and validate candidate-year/position compatibility.
- Dependencies: H-01; schema contract.
- Estimated complexity: Medium/Large
- Suggested implementation phase: Phase 1
- Verification criteria: Malformed direct writes fail; every collection has a documented schema; fuzz/negative tests cover types, lengths, unknown fields, and cross-document relationships.

### H-07 — No effective rate limiting, App Check, brute-force control, or suspicious-login monitoring

- Category: Security / abuse prevention / scalability
- Finding: The app has no application-level rate limits, CAPTCHA/App Check, lockout policy, anomaly detection, or security-event stream. Firebase Auth and Firestore rules alone do not provide the required election-specific controls.
- Current state: Auth and Firestore client calls are direct; no Functions or monitoring code exists.
- Why it matters: Attackers can hammer login, anonymous signup, registration, candidate-image uploads, and read subscriptions.
- Risk or impact: Account enumeration/DoS, ballot stuffing, quota/cost spikes, and operational blindness.
- Severity: High
- Affected users or roles: All users; administrators; department budget owner.
- Affected files/modules/pages: AuthCard/auth service; Firebase config; Functions placeholder; deployment config.
- Recommended solution: Add App Check, per-identity/IP/device throttles at a backend edge, exponential backoff, abuse telemetry, admin alerts, and explicit lockout/recovery behavior. Treat suspicious events as security logs, not ordinary UI errors.
- Dependencies: H-01; monitoring provider; privacy review for device/IP data.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: Load/abuse tests show bounded request and write rates; repeated failures trigger controls; alerts fire on threshold breaches without logging raw passwords or ballot choices.

### H-08 — Personal-data governance and user rights are missing

- Category: Privacy / compliance
- Finding: The repository contains no privacy notice, terms, cookie/tracking policy, consent record, retention schedule, deletion workflow, export workflow for users, processor/vendor inventory, breach plan, or data-subject request process. Admin CSV exports include names, student numbers, emails, sections, and voting status.
- Current state: PII is stored in `voters/{uid}` and exposed to admins; `votersToCsv()` is available in the admin console (`lib/admin/adminCore.ts:143-154`). No retention metadata or cleanup job exists.
- Why it matters: Student election data is personal and participation can be sensitive. Legal compliance cannot be inferred from Firebase usage or security rules.
- Risk or impact: Excessive retention, unauthorized disclosure, inability to honor rights, regulatory/contractual exposure, and reputational harm.
- Severity: High
- Affected users or roles: Students, guests, admins, institution/data-protection officer.
- Affected files/modules/pages: voter schema; admin export; Firebase project settings; all public pages.
- Recommended solution: Perform formal legal/privacy review; publish purpose/retention/access notices; minimize data; separate identity/participation/ballot data; implement export/deletion/rectification workflows with election-retention exceptions documented; record consent/legal basis and policy versions; restrict and audit exports.
- Dependencies: Institutional policy and legal counsel; H-01; backup/retention design.
- Estimated complexity: Large
- Suggested implementation phase: Phase 0 policy blocker, Phase 2 implementation
- Verification criteria: Data inventory and retention matrix approved; a test user can request/export/delete permitted data; exports are role-gated, reasoned, audited, and redacted; breach runbook is exercised.

### H-09 — Backup, recovery, monitoring, and disaster recovery are not implemented

- Category: Infrastructure / operations
- Finding: `firebase.json` defines hosting, rules, indexes, and emulators but no scheduled backup, restore verification, uptime check, alerting, error tracking, log retention, RTO/RPO, or incident runbook. Deploy docs mention exports but not tested restoration.
- Current state: No Functions/jobs/monitoring configuration in the repository.
- Why it matters: An election cannot be reconstructed confidently after accidental deletion, bad deployment, provider outage, or compromised admin action.
- Risk or impact: Permanent vote/data loss, prolonged outage, inability to prove results, and uncontrolled incident response.
- Severity: High
- Affected users or roles: All voters; election committee; institution leadership.
- Affected files/modules/pages: Firebase infrastructure; docs/deploy runbook; audit/tally data.
- Recommended solution: Define RPO/RTO, enable encrypted scheduled exports/backups, test restore into staging, add uptime/error/security alerts, retain immutable election snapshots, and document incident command/communications.
- Dependencies: Cloud billing/IAM; privacy retention policy; H-01.
- Estimated complexity: Large
- Suggested implementation phase: Phase 2
- Verification criteria: A timed restore drill meets RPO/RTO; alerts reach named responders; a rollback and rules rollback are rehearsed; backup retention is documented and tested.

### H-10 — Dependency audit has high-severity findings

- Category: Supply-chain security
- Finding: Local `npm audit` reports high-severity advisories through Next.js, undici, and related Firebase packages. The production dependency audit reports 12 advisories (2 high); the full app audit reports 20 (5 high); rules tests report 18 (1 high).
- Current state: `voting-app/package.json` pins Next 14/Firebase 10 ranges; audit remediation would require breaking upgrades according to npm.
- Why it matters: Vulnerable build/runtime dependencies increase DoS, request-smuggling, parser, and supply-chain risk even when the app is statically hosted.
- Risk or impact: Build compromise, CI risk, development-tool exposure, or runtime vulnerabilities if deployment architecture changes.
- Severity: High
- Affected users or roles: Production users; CI/deployment operators.
- Affected files/modules/pages: `package.json` and both lockfiles.
- Recommended solution: Triage advisories by reachability and deployment mode; upgrade Next/Firebase/Firebase CLI in a dedicated compatibility branch; pin lockfiles; add automated dependency scanning and release gates; do not blindly run `npm audit fix --force`.
- Dependencies: Regression/E2E suite; deployment compatibility review.
- Estimated complexity: Medium/Large
- Suggested implementation phase: Phase 1
- Verification criteria: High advisories are resolved or formally risk-accepted with reachability evidence; lockfiles reproduce clean installs; build, rules, and end-to-end suites pass after upgrades.

### H-11 — Audit log is append-only but not complete or trustworthy

- Category: Audit / security operations
- Finding: Rules permit any admin to create an audit entry with only `ts`, `actorUid`, `action`, and `target`; they do not constrain action vocabulary, actor role, target, details, or correspondence to a mutation. UI mutations call `createAudit()` afterward and can leave gaps.
- Current state: `firebase/firestore.rules:319-324,396-401`; `adminData.ts:144-235`.
- Why it matters: An append-only log is not an audit trail if actions can be performed without a matching event or events can be forged semantically by an authorized client.
- Risk or impact: Weak investigations, inability to prove who changed results, and non-repudiation failure.
- Severity: High
- Affected users or roles: Election committee, auditors, superadmins.
- Affected files/modules/pages: Audit rules; admin/superadmin operations; Lifecycle panel.
- Recommended solution: Generate audit events server-side in the same transaction/outbox as the action; restrict event schema and action vocabulary; include election ID, request ID, reason, before/after hashes, and result; make security events separate from business audit.
- Dependencies: H-01; immutable snapshot design.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: Every accepted privileged operation produces one valid event; forged action/role/target fields are rejected; audit queries are paginated and exportable; tamper/omission tests pass.

### H-12 — Storage upload controls are insufficient for an untrusted file boundary

- Category: Security / media handling
- Finding: Storage rules accept any `image/*` MIME type up to 2 MB. MIME is client-controlled; there is no server-side content inspection, dimension/pixel limit, malware scan, filename/content normalization, or orphan cleanup guarantee.
- Current state: `firebase/storage.rules:18-27`; client validation/upload in `adminData.ts:82-95`.
- Why it matters: Malformed images can cause parser/resource attacks, and stale candidate files can accumulate or expose unintended content.
- Risk or impact: Storage abuse, browser/parser issues, quota cost, and privacy leakage through durable download URLs.
- Severity: High
- Affected users or roles: Voters viewing images; admins; storage operators.
- Affected files/modules/pages: Storage rules; candidate upload/delete flow.
- Recommended solution: Upload to quarantine, inspect server-side, normalize/re-encode, cap dimensions and total bytes, generate controlled derivatives, use safe opaque paths, and make cleanup/replacement transactional or job-backed. Decide whether published images should be public.
- Dependencies: H-01; storage lifecycle policy.
- Estimated complexity: Medium/Large
- Suggested implementation phase: Phase 1
- Verification criteria: Polyglot/non-image uploads fail; oversized dimensions fail; replacement/deletion leaves no unintended objects; public/private image behavior matches policy.

### H-13 — Security headers and deployment hardening are unspecified

- Category: Infrastructure / browser security
- Finding: `firebase.json` has no headers, redirects, CSP, HSTS, clickjacking, referrer, permissions, or MIME-sniffing policy. CORS and authorized domains are documented operationally but not validated in the repository.
- Current state: Static Firebase Hosting configuration only; admin page injects a large CSS string with `dangerouslySetInnerHTML` from a build-time mockup file (`app/admin/page.tsx:53-101`).
- Why it matters: Browser defense-in-depth and deployment behavior are left to undocumented console state.
- Risk or impact: Clickjacking, unsafe resource loading, weaker XSS containment, and inconsistent production configuration.
- Severity: High
- Affected users or roles: All users; admins.
- Affected files/modules/pages: `firebase.json`; Next metadata/layout; admin page.
- Recommended solution: Add tested Hosting security headers/CSP/HSTS and explicit authorized-domain/CORS configuration. Move build-time CSS into a reviewed stylesheet or generated artifact with a safe build step; avoid runtime HTML injection where possible.
- Dependencies: Asset inventory; Firebase Hosting deployment review.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 1
- Verification criteria: Header scanner and browser tests verify CSP/HSTS/frame policy; all assets load under CSP; production domain is HTTPS-only and authorized-domain configuration is checked in/runbook-verified.

## Medium and lower-priority findings

### M-01 — Required account/product surfaces are incomplete

- Category: Product/UI
- Finding: No forgot-password, account deletion, user self-service export, notifications/toasts system, support/ticket path, onboarding, consent center, session-expired screen, offline state, retry affordance, or maintenance state exists consistently across routes. Profile is display-only despite the broader plan describing profile management.
- Current state: AuthCard and dashboard implement the happy path; status/loading/error components are limited and route-specific.
- Why it matters: Users have no safe recovery or support path when ordinary failures occur.
- Risk or impact: Abandonment, support burden, inaccessible recovery, and accidental duplicate attempts.
- Severity: Medium
- Affected users or roles: Students, guests, admins.
- Affected files/modules/pages: AuthCard; dashboard; vote/results/admin route states.
- Recommended solution: Prioritize reset/recovery, retry/session-expired, explicit offline handling, and support contact before adding non-election features such as subscriptions/payments, which are not relevant to this product.
- Dependencies: H-05; support ownership.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 2
- Verification criteria: Each route has loading, empty, error, offline, permission-denied, and session-expired states with an actionable recovery path.

### M-02 — Accessibility implementation has specific gaps despite good baseline intent

- Category: Accessibility (WCAG 2.1/2.2)
- Finding: Error text is not consistently associated with inputs using `aria-describedby`/`aria-invalid`; `CustomSelect` keeps keyboard focus on the button while applying `aria-activedescendant` to a portal listbox; the candidate card contains a button nested inside a `<label>`; CandidateModal and the review sheet focus the close button but do not fully trap/restore focus.
- Current state: Some visible focus styles, labels, radiogroups, dialog roles, reduced-motion CSS, and a mobile drawer focus trap exist. These gaps require browser/AT confirmation.
- Why it matters: Screen-reader users may not hear validation/current-option changes, and keyboard users can tab behind dialogs or activate nested controls unexpectedly.
- Risk or impact: WCAG 1.3.1, 2.1.1, 2.4.3, 2.4.7/2.4.11, 3.3.1, 3.3.3, and 4.1.2 failures.
- Severity: Medium
- Affected users or roles: Keyboard-only users; screen-reader users; users with motor/cognitive disabilities.
- Affected files/modules/pages: AuthCard; CustomSelect; BallotContent; CandidateModal; admin ConfirmDialog.
- Recommended solution: Use native selects where practical or implement the APG combobox/listbox pattern correctly; associate errors and invalid state; avoid nested interactive elements; use a shared dialog primitive with focus trap, restore, labelled title, and inert background.
- Dependencies: Fresh keyboard + NVDA/VoiceOver/axe run; component tests.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 1 accessibility hardening
- Verification criteria: Automated axe scan is clean for critical violations; manual keyboard/AT tests cover auth, select, ballot, review, candidate details, admin drawer, and confirm dialogs.

### M-03 — Static marketing dates and ballot counts can diverge from live election data

- Category: Product correctness / content
- Finding: Landing dates, 20 positions, 17 races, and 2026 labels are hardcoded in `app/page.tsx`; dashboard repeats constants; `Election` does not model the displayed schedule fields.
- Current state: Admin can change title/status, but not the dates displayed to voters.
- Why it matters: Students may rely on stale dates or see a count that does not match a configured election.
- Risk or impact: Missed voting windows and support disputes.
- Severity: Medium
- Affected users or roles: Students and election committee.
- Affected files/modules/pages: Landing; dashboard; Election type/schema; superadmin elections.
- Recommended solution: Store and display timezone-aware schedule metadata from the selected election; use the configured positions to calculate counts; retain static copy only as a clearly labelled general explanation.
- Dependencies: H-03; timezone policy.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 2
- Verification criteria: Changing an election schedule/position set updates all relevant student/admin surfaces; dates render consistently in Philippine time with accessible timezone text.

### M-04 — Configuration failure defaults to guest access enabled

- Category: Fail-safe security / reliability
- Finding: `loadAppConfig()` catches all errors and returns `DEFAULT_APP_CONFIG`, where `allowGuestVoters: true`. The landing watcher has no error callback and therefore leaves guest mode enabled on a read failure.
- Current state: `voting-app/lib/appConfig.ts:11-31,34-39`; `app/page.tsx:19-21`; guest rule also defaults to allowed when `config/app` is absent (`firestore.rules:133-135`).
- Why it matters: An outage or accidental deletion of the policy document silently enables the highest-abuse authentication path.
- Risk or impact: Abuse during outage, unexpected registration, and fail-open security posture.
- Severity: Medium/High
- Affected users or roles: Guest voters; election committee.
- Affected files/modules/pages: app config; landing; Firestore rules.
- Recommended solution: Fail closed for guest voting and sensitive policy reads; distinguish “config absent” in development from production; add cached signed policy/version with an explicit emergency mode and alert.
- Dependencies: H-07; deployment environment flag.
- Estimated complexity: Small/Medium
- Suggested implementation phase: Phase 1
- Verification criteria: Config outage/absence disables guest signup in production and surfaces an operator alert; tests cover watch/read failures and stale cache behavior.

### M-05 — Admin data loading is unbounded and scales with full collections

- Category: Performance / cost / privacy
- Finding: Admin subscriptions load all voters and all votes into the browser (`watchVoters`, `watchVotes`); the voters table only slices after the full query. The live vote array is used for all aggregates and charts.
- Current state: `adminData.ts:28-79`; `useAdminElectionData.ts:37-59`; `VotersPanel.tsx:27-35`.
- Why it matters: Network, memory, render time, Firestore read cost, and exposure increase with every voter/vote.
- Risk or impact: Slow admin console, quota/cost spikes, browser failure during a large election, and unnecessary PII distribution.
- Severity: Medium
- Affected users or roles: Admins; institution budget owner.
- Affected files/modules/pages: Admin hook/data; VotersPanel; Overview/Results panels.
- Recommended solution: Server-side pagination/search, aggregate documents or backend queries for metrics, bounded time windows, and explicit export jobs. Do not stream raw vote identity-bearing data to the browser.
- Dependencies: H-01/C-01; query/index design.
- Estimated complexity: Large
- Suggested implementation phase: Phase 2
- Verification criteria: Load test with realistic/peak voter and vote counts meets latency/memory budgets; admin browser never receives more data than the current page/metric requires.

### M-06 — Test suite wiring is broken and coverage misses the highest-risk negatives

- Category: Testing / quality
- Finding: Existing tests cover pure domain logic and expected rules behavior, but there are no explicit tests for partial direct ballots, forged `hasVoted`, admin vote-to-UID reads, candidate mutation after votes, malformed field payloads, guest abuse, backup restore, accessibility, load, browser matrix, or deployment headers. In addition, the documented phase tests are not runnable after the migration.
- Current state: 59 frontend unit tests and the default rules script pass. The explicit phase-suite command stops at `phase2.auth.test.js`, which imports the missing `web/src/auth/guards-core.js`; phase 3/4/6 therefore do not run from the current checkout. No test runner/script for E2E, axe, load, or restore exists in `package.json`.
- Why it matters: Passing the current suite can create false confidence around the actual launch blockers.
- Risk or impact: Security regressions reach production unnoticed.
- Severity: Medium/High
- Affected users or roles: All roles.
- Affected files/modules/pages: `voting-app` tests; `firebase/rules-tests`; CI (not present).
- Recommended solution: Add negative rules tests first, then backend integration/concurrency tests, E2E election lifecycle tests, axe/WCAG checks, mobile/browser matrix, load/cost tests, migration tests, and restore drills. Define coverage and security gates.
- Dependencies: C-01/C-02/C-03 design fixes; CI provider.
- Estimated complexity: Large
- Suggested implementation phase: Phase 1
- Verification criteria: CI blocks merges on security/integrity/accessibility regressions; the full required matrix is reproducible from a clean checkout; all phase scripts either target the current `voting-app` modules or are clearly retired.

### M-07 — CI/CD and environment separation are not represented

- Category: Deployment / developer experience
- Finding: There is no CI workflow, staging Firebase project, formal environment manifest, preview deployment, automated rollback, or production smoke-test automation. `voting-app/.env` points at the live project; the safer emulator flag is opt-in.
- Current state: README/runbooks provide manual commands; production access-budget smoke test is explicitly not executed.
- Why it matters: Manual setup makes accidental production writes and environment drift likely.
- Risk or impact: Data contamination, unreviewed deploys, slow rollback, and non-reproducible releases.
- Severity: Medium/High
- Affected users or roles: Developers; deploy operators; voters.
- Affected files/modules/pages: Firebase config; env handling; docs; repository CI.
- Recommended solution: Add development/staging/production project separation, CI with emulator tests/build/lint/typecheck/audit, protected production deploy approval, immutable release artifacts, rollback procedure, and safe default environment guards.
- Dependencies: Cloud projects/IAM; H-09.
- Estimated complexity: Large
- Suggested implementation phase: Phase 2
- Verification criteria: A clean PR runs all checks; production deploy requires explicit approval; app startup refuses a production project when emulator/test mode is requested and vice versa.

### M-08 — Documentation is materially stale or contradictory

- Category: Documentation / maintainability
- Finding: README/PROJECT_PLAN/MIGRATION_NOTES/deploy runbook disagree about the hosting root (`web/` vs `voting-app/out`), build model (plain HTML vs Next), and desktop admin app. `web/` and the planned Python app are absent, while docs still describe them. Test fixtures also retain legacy `BSCS 3-A` section formats while the app uses `BSCS-3A`.
- Current state: `firebase.json` uses `voting-app/out`; `admin-app` has only `.env`; `MIGRATION_NOTES.md` says legacy files were retained although `web/` is not present.
- Why it matters: Operators can run the wrong deploy/seed path or misunderstand the supported architecture.
- Risk or impact: Failed releases, production data mistakes, and onboarding delay.
- Severity: Medium
- Affected users or roles: Developers; election operators; auditors.
- Affected files/modules/pages: README; PROJECT_PLAN; MIGRATION_NOTES; deploy runbook; seed/tests.
- Recommended solution: Declare one source-of-truth architecture, archive/delete obsolete plans or mark them historical, correct deploy commands, document the actual admin surface, and normalize all fixtures/data through one migration.
- Dependencies: H-01/H-03; product architecture decision.
- Estimated complexity: Small/Medium
- Suggested implementation phase: Phase 1
- Verification criteria: A new operator can follow README from clean checkout to emulator test and staging deploy; every referenced path exists or is explicitly historical.

### M-09 — Build is coupled to a mockup file and working directory

- Category: Build / maintainability
- Finding: `app/admin/page.tsx` reads `../mockups/admin-redesign.html` at build time and parses its `<style>` block with PostCSS. This makes production compilation depend on a design-reference file outside the app and on the current working-directory layout.
- Current state: Build passes from `voting-app`, but the coupling is not a stable application asset boundary.
- Why it matters: Moving the app, packaging only the app, or changing the mockup can break builds or alter admin production CSS unexpectedly.
- Risk or impact: CI/deployment failures and unreviewed visual regressions.
- Severity: Medium
- Affected users or roles: Developers and admins.
- Affected files/modules/pages: `app/admin/page.tsx`; `mockups/admin-redesign.html`; styles.
- Recommended solution: Extract reviewed CSS into a versioned app stylesheet or generate a checked-in artifact in a dedicated build step; remove runtime/build-time parsing from the route module.
- Dependencies: UI regression screenshots and CSS ownership decision.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 2
- Verification criteria: `npm --prefix voting-app run build` and a clean isolated app build work without the mockups directory; CSS changes are visible in code review.

### L-01 — Image optimization warnings remain

- Category: Performance
- Finding: Lint reports seven raw `<img>` usages for candidate photos, results, and loading assets.
- Current state: `npm run lint` passes with warnings; `next.config.mjs` disables Next image optimization for the static export.
- Why it matters: Candidate-heavy pages can transfer more bytes and delay LCP.
- Risk or impact: Moderate bandwidth and mobile performance cost.
- Severity: Low
- Affected users or roles: Mobile voters and public results visitors.
- Affected files/modules/pages: Candidate cards/modal; results; loading; admin roster.
- Recommended solution: Use responsive pre-generated derivatives or a controlled image CDN/storage transform; keep `alt` policy explicit for decorative vs meaningful images.
- Dependencies: H-12 storage pipeline.
- Estimated complexity: Small/Medium
- Suggested implementation phase: Phase 3
- Verification criteria: Mobile Lighthouse/WebPageTest budgets pass and lint warnings are eliminated or documented.

### L-02 — Visual audit and compatibility matrix are incomplete

- Category: Responsive/accessibility QA
- Finding: The repository contains prior screenshots and a prior E2E summary, but this audit did not have fresh browser capture or an automated browser/AT matrix. Browser differences, large text, zoom, touch, offline, and reduced-motion behavior are not currently proven by the available commands.
- Current state: CSS includes responsive breakpoints and reduced-motion rules; source review suggests good intent but cannot establish rendered WCAG conformance.
- Why it matters: Election-day failures often occur in device/browser states not covered by a build or unit test.
- Risk or impact: Unusable ballot controls, clipped modal/select content, or inaccessible confirmation on real devices.
- Severity: Low/Medium
- Affected users or roles: Mobile, keyboard, screen-reader, low-vision, and older-browser users.
- Affected files/modules/pages: All routes, especially `/vote`, `/`, `/admin`.
- Recommended solution: Capture current desktop/mobile states and run keyboard, NVDA/VoiceOver, axe, zoom/large-text, offline/slow-network, and supported-browser checks against an emulator-backed staging build.
- Dependencies: Browser automation and AT test environment.
- Estimated complexity: Medium
- Suggested implementation phase: Phase 1 QA
- Verification criteria: Accepted screenshot set covers landing/auth, ballot, review, confirmation, denied, results locked/published, admin mobile drawer, and error/offline states; all findings are triaged.

## Missing UI components and product capabilities

The current UI has landing/auth, student dashboard, ballot/review, public results, admin console, superadmin console, 404, loading, empty, denied, maintenance, and basic error states. The following are missing or incomplete and should be prioritized by user need:

| Gap | Where / users | Priority | Dependencies / approach |
|---|---|---:|---|
| Password reset and account recovery | Landing/auth; students/admins | P0 | H-05; Firebase Auth email flow plus support escalation |
| Session-expired and reauthentication state | Protected routes; all signed-in roles | P0 | Session policy; preserve unsent ballot locally only if privacy-approved |
| Offline/slow-network/retry state | Auth, ballot submit, admin mutations | P0 | Idempotent backend and explicit “not submitted” messaging |
| Secret-ballot-safe admin results | Admin Results/Overview | P0 | C-01; aggregate-only backend data |
| Election schedule/status sourced from live config | Landing/dashboard/ballot/results | P1 | H-03/M-03; timezone-aware schema |
| User deletion/export and privacy notices | Landing/footer/account | P1 | H-08 legal/data-governance decision |
| Admin audit/security event viewer with bounded queries | Superadmin/admin operations | P1 | H-11; pagination and event taxonomy |
| Candidate roster freeze and correction workflow | Admin Candidates/Lifecycle | P1 | H-02; soft-delete/versioned snapshots |
| Bulk voter import/correction and abuse review | Admin/Voter operations | P2 | Trusted backend, validation, audit |
| Announcements/support/help/FAQ contact route | Landing/dashboard/maintenance | P2 | Named department owner; non-sensitive support channel |
| Election cycle create/archive | Superadmin Elections | P1 | H-03; multi-election schema |

Subscriptions, payment, billing, refunds, and other generic SaaS capabilities from the request are **not applicable launch requirements** for this department election unless the product scope changes.

## Backend and database gaps

Verified schema gaps include missing election schedule fields in the active TypeScript model, no ballot snapshot/version, no privacy retention/deletion metadata, no security-event collection, no job/outbox/idempotency record, and no trusted tally/reconciliation record. The existing composite indexes support current candidate/vote queries, but they do not solve full-collection admin reads or historical/multi-election scale. The schema should be redesigned around:

1. Election/version and immutable position/candidate snapshots.
2. A restricted participation/eligibility ledger separate from ballot contents.
3. Randomized, aggregateable ballot records without browser-readable voter identity.
4. Server-generated tally snapshots with input hash, publication actor/time, and reconciliation status.
5. Append-only security events and business audit events with bounded access.
6. Retention/deletion metadata and export/access-request records.

## Accessibility and responsive assessment

Positive source evidence: semantic headings/sections, visible global `:focus-visible`, labelled inputs, radio inputs for ballot choices, `aria-pressed` filter buttons, `aria-modal` dialog roles, a mobile drawer focus trap, `aria-hidden` decorative canvas, and reduced-motion CSS are present. These are foundations, not proof of conformance. The M-02 issues must be resolved and verified against WCAG 2.2 AA, especially input error association, custom listbox semantics, nested interactive controls, dialog focus containment, contrast of muted/gradient text, touch target size, zoom/large-text reflow, and motion.

## Testing and deployment gaps

The passing suites establish a useful baseline but are not launch evidence for the critical paths above. Before launch, CI should require typecheck, lint, unit tests, all emulator rules tests, backend integration/concurrency tests, E2E from clean seed, axe scan, supported-browser/mobile tests, dependency scan, staging migration/restore, and a production-like smoke test that does not write real voter data. The documented production 17-vote smoke test remains intentionally unexecuted; it must use a separate staging project or disposable election under explicit operational approval.

## Quick wins

1. Add negative rules tests for C-02/C-03, malformed voter fields, candidate mutation after votes, and admin raw-vote reads.
2. Change guest/config failure behavior to fail closed and add an explicit operator alert.
3. Correct `/results` locked-state reads for signed-out pre-publication visitors.
4. Add `aria-invalid`/`aria-describedby`, fix nested ballot interactivity, and implement proper dialog focus handling.
5. Replace `autoComplete="off"` with correct password-manager tokens.
6. Freeze/deactivate candidates after voting opens and block destructive deletion when votes exist.
7. Correct the README/runbook architecture and add a one-command clean-checkout verification path.
8. Add Firebase Hosting security headers and a dependency-upgrade branch with regression tests.

## Recommended phased roadmap

### Phase 0 — Do not launch

Resolve C-01 through C-04, choose the identity/guest policy, freeze the production data model, and obtain privacy/legal sign-off. Keep the election closed.

### Phase 1 — Trust boundary and security hardening

Introduce the trusted backend, server-side schema/state validation, atomic audit, candidate/election snapshots, rate limits/App Check, safe storage pipeline, security headers, account recovery, negative security tests, and accessibility fixes.

### Phase 2 — Operations and scale

Add staging/CI/CD, backups and restore drills, monitoring/alerts, incident runbook, paginated admin queries, aggregate metrics, privacy rights/retention workflows, and multi-election support.

### Phase 3 — Product polish

Add schedule-driven content, support/announcements, richer admin workflows, image optimization, browser compatibility matrix, and non-critical UI refinements.

## Final production-readiness score: 41/100

Score rationale:

- Frontend implementation and baseline UX states: **11/15** — broad route coverage and responsive CSS foundations, but recovery/offline/accessibility verification gaps.
- Core election correctness: **7/25** — deterministic IDs and candidate checks are useful, but complete-ballot enforcement, voter-lock integrity, roster immutability, and multi-election correctness are not secured.
- Authentication/authorization/abuse resistance: **7/20** — Firebase Auth and custom claims/rules are present, but guest identity is forgeable and election-specific abuse controls are absent.
- Privacy and compliance: **3/15** — PII handling exists, but secret-ballot exposure, retention, rights, legal notices, and breach governance are missing.
- Backend/data/operations: **5/15** — Firestore schema/indexes and emulator rules are usable, but there is no trusted backend, backup/restore, monitoring, or CI/CD environment separation.
- Testing/developer experience: **8/10** — strong frontend unit/default-rules baseline and clean build/typecheck/lint, reduced because phase test wiring is broken and critical negative, accessibility, load, restore, and deployment tests are absent.

This score should not be read as a legal-compliance determination. It is an engineering readiness estimate based on the repository evidence above. The application can continue as an emulator-backed prototype, but real voting should remain blocked until the critical findings are closed and independently verified.
