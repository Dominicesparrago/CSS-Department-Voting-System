# Rate-Limit & Surge Hardening

Changes that remove the per-vote write hotspot and add abuse controls, plus the
manual console steps required before opening a large election.

## What changed in code

1. **Vote path no longer touches `tallies/{electionId}`** (`firebase/functions/index.js`).
   A single tally document sustains only ~1 write/sec; incrementing it inside
   every vote transaction serialized the whole election under load. Each ballot
   now only writes anonymous `ballots/{id}` docs and the voter's own
   participation lock — both naturally distributed, no shared hot doc.
2. **Live results are manual.** The admin Results panel refreshes through
   `getResults` (server recomputes counts from immutable ballots on demand).
   The old `watchLiveResults` subscription to the tally doc was removed
   (`voting-app/lib/admin/adminData.ts`, `useAdminElectionData.ts`). Counts are
   still written once by `publishTally` at close, so published/student-facing
   results are unchanged.
3. **App Check enforced on student-facing callables** (`submitBallot`,
   `checkMyRosterStatus`, `verifyStudentAgainstRoster`) via
   `enforceAppCheck: true`. Scripts and bots cannot mint reCAPTCHA tokens.
   `verifyStudentAgainstRoster` stays pre-auth by design: registration runs it
   before the Auth account exists.
4. **Cold-start protection**: `submitBallot` runs with `minInstances: 1`.
5. Client initializes App Check in `voting-app/lib/firebase/init.ts`
   (reCAPTCHA v3, auto-refresh).

## Required console / billing steps (before election day)

1. **Upgrade the project to the Blaze plan.** Spark daily caps (20K writes /
   50K reads) can be exhausted mid-election; Blaze removes the caps and this is
   required for `minInstances` anyway.
2. **Create a budget alert** (Billing → Budgets), e.g. $10 threshold.
3. **Register the web app in App Check**: Firebase console → App Check → Apps →
   register with **reCAPTCHA v3**, copy the *site key* into
   `voting-app/.env.local` as `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, and store the
   *secret key* for future enforcement tuning.
4. **Local/dev tokens**: set `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` (from App Check
   → Apps → Manage debug tokens) when testing production backends from localhost.
5. **Enable App Check enforcement**:
   - Cloud Functions: enforce after confirming real browsers send valid tokens
     (start with "monitor" metrics, then flip to enforced).
   - Firestore: enable enforcement (this also protects collections not covered
     by callable-level checks).
6. **Deploy**: `npm run deploy` in `voting-app/` (builds the app, then deploys
   hosting + functions + firestore + storage).

## Load expectations

- Votes no longer contend on any shared document; throughput scales with
  function instances instead of the 1-write/sec tally limit.
- `getResults` reads all ballots per call (~17 docs per voter). With manual
  refresh this is occasional admin traffic, not a per-vote cost.
- If you later want live-updating numbers again, prefer sharded counters or a
  scheduled aggregator — never reintroduce a per-vote write to one tally doc.
