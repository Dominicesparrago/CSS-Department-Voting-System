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
