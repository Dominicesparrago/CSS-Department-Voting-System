# Migration Notes — Next.js App Router

## Overview
Plain HTML/CSS/JS in `web/` → Next.js 14 App Router in `voting-app/` with static export (`output: 'export'`).
Firebase Hosting `public` is now `voting-app/out`.

---

## File-by-file mapping

| Old (`web/`) | New (`voting-app/`) |
|---|---|
| `index.html` | `app/page.tsx` + `components/auth/AuthCard.tsx` |
| `vote.html` | `app/vote/page.tsx` + `components/ballot/BallotContent.tsx` + `components/ballot/CandidateModal.tsx` |
| `admin/index.html` | `app/admin/page.tsx` + `components/admin/AdminDashboard.tsx` + `components/admin/tabs/*.tsx` |
| `src/ui/theme.css` | `styles/theme.css` (unchanged copy) |
| `src/ui/components.css` | `styles/components.css` (unchanged copy) |
| `src/ui/binaryRain.js` | `components/BinaryRain.tsx` |
| `src/ui/interactions.js` | `components/Interactions.tsx` |
| `src/firebase/config.js` | `lib/firebase/config.ts` (values → `NEXT_PUBLIC_*` env vars) |
| `src/firebase/init.js` | `lib/firebase/init.ts` (CDN imports → npm `firebase` v10) |
| `src/auth/authService.js` | `lib/auth/authService.ts` |
| `src/auth/errors.js` | `lib/auth/errors.ts` |
| `src/auth/guards-core.js` | `lib/auth/guards-core.ts` |
| `src/auth/guards.js` | Merged into page components (`app/vote/page.tsx`, `app/admin/page.tsx`) |
| `src/auth/indexPage.js` | `components/auth/AuthCard.tsx` |
| `src/auth/session.js` | `lib/auth/session.ts` + `hooks/useSession.ts` |
| `src/auth/validation.js` | `lib/auth/validation.ts` |
| `src/student/ballotData.js` | `lib/student/ballotData.ts` |
| `src/student/ballotState.js` | `lib/student/ballotState.ts` |
| `src/student/studentRoute.js` | `components/ballot/BallotContent.tsx` |
| `src/student/voteSubmit.js` | `lib/student/voteSubmit.ts` |
| `src/admin/adminCore.js` | `lib/admin/adminCore.ts` |
| `src/admin/adminData.js` | `lib/admin/adminData.ts` |
| `src/admin/adminRoute.js` | `components/admin/AdminDashboard.tsx` + all tab components |
| `assets/` | `public/assets/` |

---

## Behavioral changes

**None.** All original logic is preserved:
- Deterministic vote document IDs: `{electionId}__{uid}__{positionId}`
- All-at-once transactional ballot via `writeBatch`
- Year-scoped ballot (department + own year representative only)
- Admin custom claim gating (`claims.admin === true || claims.role === 'admin'`)
- Self-registration validation (`.scc@gmail.com` + 7–9 digit student ID)
- Results stay private; published only after election is closed + admin publishes

**Routing changes:**
- `/vote.html` → `/vote`
- `/admin/` → `/admin`
- Redirects use `router.replace()` (Next.js) instead of `window.location.assign()`

**Icons:** Feature card text icons (`1×`, `YR`, etc.) replaced with Lucide React SVG icons. Sign-out button has a `<LogOut>` icon. Modal close button uses `<X>` icon.

**Charts:** CDN Chart.js → `react-chartjs-2` v5 + `chart.js` v4 npm packages.
Same teal palette, same chart types and options preserved exactly.

---

## Environment setup

1. Copy `.env.example` → `.env.local` (already pre-filled for this project).
2. All Firebase config values are in `NEXT_PUBLIC_*` env vars.
3. For emulators: run `firebase emulators:start`; the app auto-connects when hostname is `localhost`.

---

## Build and deploy

```bash
# Install
cd voting-app
npm install

# Development (with hot reload)
npm run dev          # runs on http://localhost:3000

# Production static export
npm run build        # outputs to voting-app/out/

# Deploy to Firebase Hosting
cd ..
firebase deploy --only hosting
```

Firebase Hosting is configured to serve `voting-app/out/` (updated in `firebase.json`).

---

## Unchanged files

The following are **not touched** by this migration:
- `firebase/firestore.rules`
- `firebase/storage.rules`
- `firebase/firestore.indexes.json`
- `firebase/rules-tests/`
- `firebase/seed-emulator.js`
- `firebase/seed-test-candidates.js`
- `admin-app/` (Python desktop admin)
- `docs/`
- `web/` (original vanilla app — kept as reference)
