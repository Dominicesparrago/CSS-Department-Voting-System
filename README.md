# CSS Department Voting System

Official student election platform for the Computer Science Department of
St. Clare College of Caloocan. Next.js 14 (static export) on Firebase
Hosting, with Firestore + Firebase Auth. Voting integrity is enforced by
Firestore security rules plus **Cloud Functions**: ballots are cast, tallied,
and published only through trusted callable functions, so the ballot is
genuinely secret (see [The secret ballot](#the-secret-ballot)).

> **Cloud Functions require the Firebase Blaze (pay-as-you-go) plan.** They
> cannot be deployed on the free Spark plan. Everything runs free against the
> local emulator suite; only production deployment needs Blaze.

## Repository layout

| Path | Purpose |
|---|---|
| `voting-app/` | The Next.js app (landing, ballot, dashboard, results, admin, superadmin) |
| `firebase/functions/` | Cloud Functions: `submitBallot`, `getResults`, `publishTally` |
| `firebase/` | Security rules, indexes, emulator seed scripts |
| `firebase/rules-tests/` | Rules test suite + Admin-SDK operational scripts |
| `mockups/` | Frozen HTML design references — do not edit; UI changes go to the app |
| `audits/` | Design/architecture audit reports and verification evidence |

## The secret ballot

A ballot must prove one-person-one-vote without being traceable to the voter.
The system separates the two:

- **`ballots/{randomId}`** — anonymous ballot records `{electionId, positionId,
  candidateId, yearLevel}`. Random id, **no uid, no timestamp**. Security rules
  deny *all* client reads and writes — even admins. Only the `submitBallot`
  function (Admin SDK) writes them.
- **`voters/{uid}.hasVoted`** — the participation lock, set only by the function.
  Proves *that* you voted, never *what*. Turnout is derived from here.
- Admins see results only through the **`getResults`** function, which returns
  aggregate counts computed server-side — never individual ballots.

Because submission is one transaction (anonymous ballots + lock) and no document
ever stores a uid alongside a choice, no query — by any admin — can link a vote
to a person.

## The official roster

Voter eligibility is not self-asserted. The `students/{studentNo}` collection is
the authoritative roster and is written **only** by the `importRoster` Cloud
Function, which re-validates every row and rejects malformed/duplicate records
before they can become eligible. Admins import the Excel/CSV file from the
**Roster** tab of the admin console (browser-side parsing via SheetJS; the
server is the source of truth for validation and writes). The `submitBallot`
function then binds the authenticated account to its roster record — the record
must exist, be active and eligible, and match the account's year level,
section, first + last name, and (when present) school email — before any
ballot is accepted. The name check is tolerant of case, middle names, and
common suffixes (e.g. "Jr."), but a made-up name on a real Student ID is
rejected, so the committee can defend the roster as fake-data-free.
Optionally, an `eligibleSections` array on the election document limits voting
to specific sections; an absent/empty array allows every active eligible
student.

Rules deny roster writes to all clients (function-only), allow admins to read
the whole roster, and allow a student to read only their own record — so the
ballot can deny early with a clear message without exposing other students'
data. Vote secrecy is unaffected: participation lives on `voters/{uid}` and
choices on anonymous ballots, never on the roster.

### Import formats

Two layouts are accepted:

- **Flat file with a Student ID column** — the template in the Roster tab. Each
  row carries a 7–9 digit student number and rows are keyed by it; re-importing
  updates in place. This is the strongest form: the registered ID is bound
  directly to a roster record.
- **Masterlist workbook without IDs** — one sheet per section named like
  `CS 1A` / `CS 2B` (the sheet name supplies section + year level), with a
  Name column in `Surname, Firstname` order and a Status column of `Enrolled` /
  `Enlisted`. Rows keep no student number and are matched to voters by
  **first + last name + section + year level** — exactly one active, eligible
  match is required, so a voter is never bound to the wrong record and
  off-list names are denied. Because the file has no ID column, the ID a
  student types at registration cannot be verified against the roster; the
  name + section match is the identity check (the trade-off of going
  ID-less). Sheets that are not roster sheets (e.g. a cover/Summary sheet)
  are skipped; an explicit Section/Year Level column wins over the sheet name.

Admins can also **remove** roster entries from the Roster tab: a per-row
delete or a "Remove all" (both confirm first, both permanent — the student can
no longer vote). Removing entries is logged to `audit`.

The ballot page's early denial now asks the `checkMyRosterStatus` Cloud
Function (server-side, returns only the caller's own result) so masterlist
voters — who have no `students/{studentNo}` record to read — get the same
clear early message as ID-keyed voters.

## Local development

```bash
# 1. Emulators — include functions (auth 9099, firestore 8081, functions 5001, storage 9199)
npx --prefix voting-app firebase emulators:start \
  --only auth,firestore,functions,storage --project css-department-voting-sy-f46a5
# (first run: cd firebase/functions && npm install)

# 2. Seed election + positions, then test candidates (sets election "open")
node firebase/seed-emulator.js
node firebase/seed-test-candidates.js

# 3. Run the app against the emulators
cd voting-app
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev
```

Never run `npm run build` while the dev server is running — they share
`.next/` and the dev server will start serving broken chunks.

### Tests

```bash
cd voting-app && npm test            # unit tests (pure domain modules, Vitest)
cd firebase/functions && npm test    # ballot-logic unit tests (node --test)
cd firebase/rules-tests && npm test  # security-rules suite (needs the firestore emulator)
```

## Access model

- **Students** register with a `.scc@gmail.com` email + 7–9 digit student ID;
  one-time (guest) voters use anonymous auth gated by `config/app.allowGuestVoters`.
- **Admins** are granted at runtime by the superadmin from `/superadmin`
  (Firestore `admins/{email}` registry — no redeploy needed).
- **Superadmin** is a custom claim, set once per environment:

One-time guest voting is fail-closed. It is unavailable until the superadmin
explicitly enables `config/app.allowGuestVoters`; a missing or unreadable config
document does not enable anonymous registration.

```bash
cd firebase/rules-tests
# emulator
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node set-superadmin.mjs <email>
# production (Admin SDK credentials required)
GOOGLE_APPLICATION_CREDENTIALS=~/.secrets/<service-account>.json \
  node set-superadmin.mjs <email> --production
```

Keep the service-account key **outside the repository** (e.g. `~/.secrets/`,
chmod 600). It is gitignored, but it should not live in the working tree.

## Deploying

Requires the **Blaze plan** (for Cloud Functions). First deploy: `cd
firebase/functions && npm install`.

```bash
cd voting-app
npm run deploy           # next build + firebase deploy (hosting, functions, firestore rules/indexes, storage rules)
npm run deploy:hosting   # hosting only — use only when rules AND functions are unchanged
```

The app, security rules, and functions are coupled (ballot submission, tally,
admin registry, config flags, guest gating), so the default deploy ships them
together. If you change `firebase/functions`, you must redeploy functions —
`deploy:hosting` alone will leave the app calling stale callables.

One-time operational scripts (dry-run by default, `--production` required
against live data): `firebase/rules-tests/migrate-section-format.mjs`
normalizes legacy `BSCS 3-A` sections to the canonical `BSCS-3A`.
