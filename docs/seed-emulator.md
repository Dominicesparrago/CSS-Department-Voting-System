# Emulator Seed Data

Phase 1 seed data writes the fixed `positions` collection and one draft election to the Firestore emulator.

Run it with the emulators active:

```powershell
firebase emulators:start --only firestore --project css-department-voting-system
node firebase/seed-emulator.js
```

Or run it as a bounded smoke command:

```powershell
firebase emulators:exec --only firestore --project css-department-voting-system "node firebase/seed-emulator.js"
```

Seeded documents:

- `positions/{positionId}`: 20 fixed CSS department positions in `PROJECT_PLAN.md` order.
- `elections/css_department_election_2026`: draft election with the ordered `positions` array.

The script targets `FIRESTORE_EMULATOR_HOST` when present, otherwise `127.0.0.1:8081`.

## Test-only candidates

For Phase 3 ballot testing, seed emulator-only candidates after the base seed:

```powershell
firebase emulators:exec --only firestore --project css-department-voting-system "node firebase/seed-phase3-test.js"
```

This writes two active `candidates` per position and sets `elections/css_department_election_2026.status` to `open`. These candidates are for local emulator testing only; real candidates are managed later through the admin surfaces.
