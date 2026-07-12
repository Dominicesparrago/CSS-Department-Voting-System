# CSS Department Voting System

Official student election platform for the Computer Science Department of
St. Clare College of Caloocan. Next.js 14 (static export) on Firebase
Hosting, with Firestore + Firebase Auth and security-rules-enforced voting
integrity. There is no server: all privileged behavior is enforced by
Firestore security rules, and superadmin bootstrap uses Admin-SDK scripts.

## Repository layout

| Path | Purpose |
|---|---|
| `voting-app/` | The Next.js app (landing, ballot, dashboard, results, admin, superadmin) |
| `firebase/` | Security rules, indexes, emulator seed scripts |
| `firebase/rules-tests/` | Rules test suite + Admin-SDK operational scripts |
| `mockups/` | Frozen HTML design references — do not edit; UI changes go to the app |
| `audits/` | Design/architecture audit reports and verification evidence |

## Local development

```bash
# 1. Emulators (auth 9099, firestore 8081, storage 9199)
npx --prefix voting-app firebase emulators:start --only auth,firestore,storage \
  --project css-department-voting-sy-f46a5

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
cd firebase/rules-tests && npm test  # security-rules suite (needs the firestore emulator)
```

## Access model

- **Students** register with a `.scc@gmail.com` email + 7–9 digit student ID;
  one-time (guest) voters use anonymous auth gated by `config/app.allowGuestVoters`.
- **Admins** are granted at runtime by the superadmin from `/superadmin`
  (Firestore `admins/{email}` registry — no redeploy needed).
- **Superadmin** is a custom claim, set once per environment:

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

```bash
cd voting-app
npm run deploy           # next build + firebase deploy (hosting, firestore rules/indexes, storage rules)
npm run deploy:hosting   # hosting only — use only when rules are unchanged
```

The app and the security rules are coupled (admin registry, config flags,
guest gating), so the default deploy ships them together.

One-time operational scripts (dry-run by default, `--production` required
against live data): `firebase/rules-tests/migrate-section-format.mjs`
normalizes legacy `BSCS 3-A` sections to the canonical `BSCS-3A`.
