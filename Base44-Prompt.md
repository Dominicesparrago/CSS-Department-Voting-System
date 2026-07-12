# Base44 Prompt — CSS Department Voting System

Build a **CSS Department Voting System** — a secure, mobile-first student election web app for the Computer Science Department of St. Clare College of Caloocan (A.Y. 2026). Use Base44's built-in database and authentication (no external backend).

## Design & Theme
Dark "terminal/console" aesthetic: near-black background, teal/mint gradient accents (#22b8a0 → #1cabb8 → #3bd6b0), monospace flourishes (a `>_` brand mark, `// section` labels), rounded cards with subtle borders, and smooth reveal animations. Fully responsive, mobile-first.

## Roles
- **Student** — registers, votes once, views own dashboard and published results.
- **Guest (one-time voter)** — signs in with name/email/year/section only, goes straight to the ballot.
- **Admin** — manages the election, candidates, voters, and live monitoring.
- **Super Admin** — manages admin accounts, election cycles, audit log, and policies.

## Data Model
- **Election**: title, status (`draft` / `open` / `closed` / `published`), registrationOpen.
- **Position**: name, order (1–20), scope (`department` or `year`), yearLevel (for year-scoped). Seed 20 positions: 01 President, 02 VP-Internal, 03 VP-External, 04 Secretary, 05 Treasurer, 06 Auditor, 07 P.R.O (Executive); 08 Business Manager Cmte, 09 Academic Cmte Chair, 10 Research Cmte Chair, 11 ICT Cmte Chair, 12 Events Cmte Chair, 13 Sports Cmte Chair, 14 Environmental Cmte Chair, 15 Membership Cmte Chair, 16 Community Cmte Chair (Committees); 17 4th Year Rep, 18 3rd Year Rep, 19 2nd Year Rep, 20 1st Year Rep (year-scoped).
- **Voter**: fullName, studentNo, email, yearLevel (1–4), section (e.g. "BSCS 3-A"), eligible (bool), guest (bool), hasVoted, votedAt.
- **Candidate**: name, positionId, section, yearLevel, platform (required), goals, bio, party (optional), photo, display order, active (bool).
- **Vote**: electionId, voterId, positionId, candidateId, yearLevel, createdAt — immutable once created.
- **AuditLog**: timestamp, actor, role, action, target, details.
- **PublishedTally**: per-candidate counts, per-position totals, turnout, publishedAt.

## Core Rules (enforce in logic, not just UI)
1. Registration requires an email matching `<name>.scc@gmail.com` and a **unique 7–9 digit student ID** (one registration per ID).
2. Each student's ballot = 16 department positions + the 1 Year Representative for **their own year level** = **17 races** (never other years' reps).
3. The full ballot is submitted **once, atomically** — every race must have a selection; no partial submissions, no changes after submitting, duplicate submissions rejected.
4. Votes are accepted only while election status is `open`.
5. **Secret ballot**: individual choices are never shown to anyone (admins see counts and participation, not who voted for whom).
6. Results are visible to students **only after** the admin publishes them (status `published`); tallies are recomputed from the vote records at publish time.
7. Every admin action (status change, candidate edit, eligibility toggle, publish) is written to the audit log.

## Pages

### 1. Landing Page (`/`) — public
Single-page marketing layout with sticky nav (About, How it works, Positions, Eligibility, Dates, FAQ, "Vote now" CTA) and these sections:
- **Hero**: kicker "// official student election · A.Y. 2026", headline "Your Voice. Your Department!", lead copy, CTA buttons, and an **Auth Card** beside it.
- **Auth Card** with 3 tabs: **Sign in** (email + password), **Register** (full name, .scc email, password, 7–9 digit student ID, year level 1–4, section), and **One-time voter** (guest: name, email, year, section). Inline field validation with error messages. After login: students → Dashboard, guests → Ballot, admins → Admin Console.
- **About**: 4 feature cards (17 races on your ballot, independent candidates, auditable outcomes, private by design).
- **How it works**: 4-step timeline — Register → Get your ballot → Review & confirm → See results.
- **Stat strip**: 20 positions · 17 races per ballot · 4 year levels · 1× verified vote.
- **Positions**: the 20-position list with filter buttons All / Executive / Committees / Year Reps.
- **Integrity**: 6 cards (one vote per position, year-scoped ballots, all-at-once submission, verified registration, secret ballot, auditable results).
- **Eligibility**, **Key dates**, **FAQ** (5 Q&As: change vote, confirmation, year rep scope, anonymity, wrong email/ID), and a final CTA band + footer.

### 2. Student Dashboard (`/dashboard`) — students only
Sidebar layout (collapsible on mobile) with the student's avatar initials, name, year & section, plus links to Ballot and Results. Three panels:
- **Overview**: welcome header, a status banner ("Your ballot is ready" / "Your ballot has been submitted" with a Vote-recorded badge), 4 stat cards (positions, your races, year level, selected count), key-dates cards, and a "Go to your ballot" CTA.
- **Profile**: avatar, full name, student ID, email, year level, section, voting status, and a ballot receipt (reference + submitted timestamp) once voted.
- **History**: list of elections participated in — shows "Voted / Did not vote" tag; expanding a voted entry shows participation = Recorded, ballot choices = Private, and the reference ID (never actual choices).

### 3. Ballot Page (`/vote`) — students & guests
- Guard states: if election is `draft` → "Voting hasn't started yet"; `closed` → "Voting has ended"; already voted → locked confirmation screen.
- Header with voter facts (student ID, year level, section, status) and a **progress bar** ("X of 17 selected").
- One card per race listing its candidates: photo (or gradient-initial placeholder), name, section/year, platform snippet; tap a candidate to open a **detail modal** (photo, platform, goals, bio, party) and select from there or from the card.
- Sticky footer: progress, "jump to next unanswered race", and a **Review** button enabled only when all 17 races are answered.
- **Review screen**: every selection listed on one page with an explicit warning that submission is final; Confirm submits all 17 votes in one atomic action, then shows a success/receipt state.

### 4. Results Page (`/results`) — public after publish
- If not published: locked state "Not published yet — official results are released after the election is published."
- When published: hero with election title, published timestamp chip, turnout count; filter buttons (All / Executive / Committees / Year Reps); one card per position showing candidates ranked by votes with avatar, animated horizontal bar, vote count and percentage (numbers animate counting up), and a **Winner** tag on the top candidate.

### 5. Admin Console (`/admin`) — admins only
Access-denied screen for non-admins. Tabbed console with 5 tabs:
- **Election**: lifecycle controls — Reopen draft / Open voting / Close voting / **Publish results** (enabled only when status is `closed`); current status line; a preview of the tally that would be published; note that every transition is audited.
- **Candidates**: add/edit form (name, position dropdown, section, year level, platform required, goals/bio/party optional, display order, active toggle, photo upload with preview & validation) + candidate table with edit/deactivate/delete.
- **Voters**: table of registered voters (name, student ID, email, year, section, eligible, voted status) with an **Enable/Disable eligibility** toggle per voter.
- **Votes**: read-only table of immutable vote records (vote ID, position, candidate, year, created time) with **Export CSV**.
- **Monitor**: live analytics — 3 metric cards (total turnout vs eligible voters, total vote documents, active candidates); a position selector; 4 charts: live vote counts per candidate (bar), vote distribution per position (doughnut), turnout by year level (bar), and a horizontal leaderboard bar chart.

### 6. Super Admin (`/superadmin`) — super admins only
Sidebar with 4 tabs:
- **Admins**: list admin accounts, invite/add admin by email, revoke access (revoking requires typing a reason, min 8 characters).
- **Elections**: manage election cycles (create, rename, archive).
- **Audit log**: chronological table — time, actor, role, action, target — automatically fed by all admin/super-admin actions.
- **Settings**: election policies (registration open/close toggle, etc.).

### 7. Utility Pages
Branded **404 page** and a branded **loading screen** (terminal-style spinner) used during page transitions and auth checks.
