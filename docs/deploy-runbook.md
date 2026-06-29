# Deploy Runbook

Phase 6 prep is complete, but production writes and deploys require explicit user approval.

## Pre-Deploy Checks

1. In Firebase Console, add `scc-css-department-vote.web.app` to Authentication > Settings > Authorized domains.
2. Confirm `.firebaserc` points to project `css-department-voting-sy-f46a5` and hosting target `scc-css-department-vote`.
3. Confirm `firebase.json`:
   - Hosting public root is `web/`.
   - Firestore rules path is `firebase/firestore.rules`.
   - Firestore indexes path is `firebase/firestore.indexes.json`.
   - Storage rules path is `firebase/storage.rules`.
4. Run the full local verification command from the repo root:

```powershell
firebase emulators:exec --only auth,firestore,storage --project css-department-voting-sy-f46a5 "npm --prefix firebase/rules-tests test && npm --prefix firebase/rules-tests run test:phase2 && npm --prefix firebase/rules-tests run test:phase3 && npm --prefix firebase/rules-tests run test:phase4 && powershell -NoProfile -Command `$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8081'; `$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'; `$env:FIREBASE_STORAGE_EMULATOR_HOST='http://127.0.0.1:9199'; `$env:STORAGE_EMULATOR_HOST='http://127.0.0.1:9199'; python admin-app/tests/phase5_admin_app_test.py"
```

## Required Production Access-Budget Smoke Test

This is REQUIRED BEFORE GO-LIVE. It writes one controlled 17-vote batch to production Firestore to confirm the real production rules accept the all-at-once ballot after the Phase 3 hardcoded-position-ID deviation.

Do this only with explicit user approval and a disposable test election/account:

1. Deploy rules and indexes first.
2. Seed only the 20 positions and one draft election.
3. Create a disposable test voter and two active test candidates per required race.
4. Move the test election to `open`.
5. Submit a full 17-race ballot from the hosted web app.
6. Confirm exactly 17 vote docs were created with deterministic IDs.
7. Confirm `voters/{uid}.hasVoted[electionId] == true`.
8. Confirm no `tallies/{electionId}` client write occurs.
9. Clean up the disposable test election/account before the real election, or do the test in a separate staging Firebase project if available.

Current status: not executed by Codex because it requires production writes.

## Production Seed

Production must start clean with only:

- 20 `positions` docs.
- One `elections/css_department_election_2026` doc with `status: "draft"`.

Do not run `firebase/seed-phase3-test.js`, `firebase/seed-phase4-test.js`, or any rules-test script against production. They are emulator-only and `firebase/seed-emulator.js` refuses non-local Firestore hosts.

Recommended clean production seed path:

1. Configure the Python Admin app with `SCC_FIREBASE_SERVICE_ACCOUNT`.
2. Run a guarded one-time Python command after explicit approval:

```powershell
$env:SCC_FIREBASE_SERVICE_ACCOUNT="C:\secure\serviceAccountKey.json"
python -c "import sys; sys.path.insert(0, 'admin-app'); from api.elections import seed_positions_and_election; seed_positions_and_election('production-bootstrap')"
```

3. Verify Firestore has no `candidates`, `voters`, `studentIndex`, `votes`, or `tallies` docs before real setup begins.

## Deploy Commands

Run only after explicit user approval:

```powershell
firebase deploy --only firestore:rules,firestore:indexes,storage --project css-department-voting-sy-f46a5
firebase deploy --only hosting:scc-css-department-vote --project css-department-voting-sy-f46a5
```

## First Admin Bootstrap

1. Create the first admin Firebase Auth user.
2. Launch `admin-app/main.py` with `SCC_FIREBASE_SERVICE_ACCOUNT` set.
3. Open `Admin Claim`.
4. Enter the user's email or uid.
5. Click `Set admin claim`.
6. Have the admin sign out and back in so the web app receives a fresh ID token.

## Dry-Run Election

Before opening to students:

1. Add real candidates through the web admin or Python admin app.
2. Open the election.
3. Register a small set of approved dry-run student accounts.
4. Submit a full 17-race ballot.
5. Close the election.
6. Publish results.
7. Confirm published tallies match immutable vote records.
8. Reset/recreate the production election data before the real election if dry-run data was written to the production project.
