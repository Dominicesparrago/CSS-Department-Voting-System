---
name: verify
description: Build, launch, and drive the CSS voting app end-to-end against local Firebase emulators to verify changes at runtime.
---

# Verify the voting app (emulator + Playwright)

Never verify against production: `voting-app/.env` points at the live Firebase project
and has no emulator flag. Always force `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`.

## Bring the stack up

```bash
# 1. Emulators (auth 9099, firestore 8081, storage 9199; needs Java — preinstalled)
cd /workspaces/CSS-Department-Voting-System
npx --prefix voting-app firebase emulators:start --only auth,firestore,storage \
  --project css-department-voting-sy-f46a5 &   # ~25s until ready

# 2. Seed: 20 positions + draft election, then 40 candidates (also flips election to "open")
node firebase/seed-emulator.js
node firebase/seed-test-candidates.js

# 3. Admin user with admin claim (auth emulator accepts `Authorization: Bearer owner`)
AUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin.scc@gmail.com","password":"admin123456","returnSecureToken":true}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['localId'])")
curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update" \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer owner' \
  -d "{\"localId\":\"$AUID\",\"customAttributes\":\"{\\\"admin\\\":true}\"}"

# 4. Dev server on a spare port
cd voting-app && NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npx next dev -p 3100 &
```

Reset between runs (data persists while emulators live):

```bash
curl -X DELETE "http://127.0.0.1:8081/emulator/v1/projects/css-department-voting-sy-f46a5/databases/(default)/documents"
curl -X DELETE -H 'Authorization: Bearer owner' "http://127.0.0.1:9099/emulator/v1/projects/css-department-voting-sy-f46a5/accounts"
```

Don't use `$UID` as a shell variable — it's readonly in bash.

## Drive it (Playwright)

Playwright isn't a project dep; `npm install playwright && npx playwright install chromium`
in the scratchpad works. Flows worth driving: register student (`*.scc@gmail.com` email,
7–9 digit ID) → lands on /dashboard; fill all 17 ballot races → review sheet → submit;
revisit /vote → already-voted screen; admin login → /admin panels (add candidate, voters
table, results bars); Lifecycle → close polls → publish (both behind confirm dialogs);
/results shows winners after publish.

Superadmin flows: bootstrap the claim with the real script (also tests it):
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node firebase/rules-tests/set-superadmin.mjs <email>`
(user must already exist in the auth emulator). Runtime admins live in the
`admins/{email}` Firestore registry, granted/revoked from /superadmin; app
policy flags live at `config/app` (guest voting, maintenance mode).

Gotchas that produce false FAILs:
- **Never run `next build` while `next dev` is serving** — they share `.next/`,
  the dev server starts 404ing its own chunks, React never hydrates, and forms
  fall back to native GET submits (password lands in the URL). Fix: kill dev,
  `rm -rf .next`, restart.
- **All admin/dashboard panels stay mounted**; only CSS class `.on` toggles visibility.
  Scope selectors to `.panel.on` or you'll click an invisible duplicate (e.g. the
  hidden Overview "Position" select shadows the Candidates form one).
- Ballot radio inputs are visually hidden (custom cards) — use `check({ force: true })`.
- Next's `router.replace` is a `replaceState` soft nav; wait for a destination selector
  (e.g. `h1:has-text("Welcome back")`), not `waitForURL`.
- CustomSelect menus portal to `document.body`: open menu is `ul.cselect-menu:not([hidden])`.
- Numbers render through `CountUp` (420ms animation) — screenshots right after load
  show 0s; assert on non-animated text or wait.
- Before publish, Firestore rules deny `tallies/*` reads — /results shows the
  "Not published yet" state (permission-denied is expected there, not an error).
