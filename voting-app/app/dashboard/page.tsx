'use client';

import BrandMark from '@/components/BrandMark';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  Clock3,
  ExternalLink,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  UserRound,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import AccessDeniedScreen from '@/components/AccessDeniedScreen';
import BinaryRain from '@/components/BinaryRain';
import RouteLoading from '@/components/RouteLoading';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { hasVotedInElection, isStudentSession } from '@/lib/auth/guards-core';
import { ELECTION_ID } from '@/lib/constants';
import { firstName, yearLabel as sharedYearLabel } from '@/lib/format';
import { initials } from '@/lib/initials';
import type { VoterProfile } from '@/lib/types';

type DashboardPanel = 'home' | 'profile' | 'history';

const TOTAL_POSITIONS = 20;
const STUDENT_RACES = 17;

function yearLabel(yearLevel?: number): string {
  return sharedYearLabel(yearLevel, 'Year level pending');
}

function formatRecordDate(value: VoterProfile['votedAt']): string {
  const date = value?.[ELECTION_ID]?.toDate?.();
  if (!date) return '';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function StudentDashboardPage() {
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    if (!current.user) return { kind: 'redirect', to: '/' };
    if (!isStudentSession(current)) return { kind: 'deny', reason: 'No voter profile was found for this account.' };
    if (current.voterProfile?.guest) return { kind: 'redirect', to: '/vote' };
    return { kind: 'allow' };
  }, 'Unable to verify your student account.');
  const [activePanel, setActivePanel] = useState<DashboardPanel>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) return;
    document.body.classList.add('no-scroll');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
    };
  }, [sidebarOpen]);

  if (status === 'loading') return <RouteLoading />;

  if (status === 'denied' || !session?.voterProfile) {
    return (
      <AccessDeniedScreen
        eyebrow="Voter dashboard"
        reason={deniedReason || 'Please sign in with a registered student account.'}
        refNote="registered voter profile required"
        titleId="dashboard-denied-title"
        actions={<button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>}
      />
    );
  }

  const voter = session.voterProfile;
  const hasVoted = hasVotedInElection(voter, ELECTION_ID);
  const panels: { key: DashboardPanel; label: string; icon: LucideIcon }[] = [
    { key: 'home', label: 'Overview', icon: LayoutDashboard },
    { key: 'profile', label: 'Profile', icon: UserRound },
    { key: 'history', label: 'History', icon: History },
  ];

  return (
    <>
      <BinaryRain id="rain" />
      <div className="topbar">
        <a className="terminal-brand" href="/">
          <BrandMark />
          <span className="nav-brand-text">
            <strong>CSS Voting</strong>
            <small>Dashboard</small>
          </span>
        </a>
        <button className="menu-btn" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>
      <div className={`scrim${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Student dashboard navigation">
          <div className="side-brand">
            <BrandMark />
            <span className="nav-brand-text">
              <strong>CSS Voting</strong>
              <small>Voter Dashboard</small>
            </span>
          </div>

          <nav className="side-nav" aria-label="Dashboard sections">
            <span className="side-cap">{'// dashboard'}</span>
            {panels.map(({ key, label, icon: Icon }) => (
              <button
                className={`item${activePanel === key ? ' on' : ''}`}
                key={key}
                type="button"
                onClick={() => {
                  setActivePanel(key);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
            <span className="side-cap">{'// election'}</span>
            <a className="item" href="/vote">
              <Vote size={18} aria-hidden="true" />
              My ballot
              <ExternalLink className="ext" size={14} aria-hidden="true" />
            </a>
            <a className="item" href="/results">
              <BarChart3 size={18} aria-hidden="true" />
              Results
              <ExternalLink className="ext" size={14} aria-hidden="true" />
            </a>
          </nav>

          <div className="side-foot">
            <div className="who">
              <span className="av">{initials(voter.fullName)}</span>
              <div>
                <b>{voter.fullName}</b>
                <small>{yearLabel(voter.yearLevel)} · {voter.section}</small>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={signOutToHome}>
              <LogOut size={14} style={{ marginRight: 6 }} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          {activePanel === 'home' && <OverviewPanel voter={voter} hasVoted={hasVoted} />}
          {activePanel === 'profile' && <ProfilePanel voter={voter} hasVoted={hasVoted} onSignOut={signOutToHome} />}
          {activePanel === 'history' && <HistoryPanel voter={voter} hasVoted={hasVoted} />}
        </main>
      </div>
    </>
  );
}

function OverviewPanel({ voter, hasVoted }: { voter: VoterProfile; hasVoted: boolean }) {
  const facts = useMemo(() => [
    { icon: Vote, value: String(TOTAL_POSITIONS), label: 'Positions' },
    { icon: ListChecks, value: String(STUDENT_RACES), label: 'Your races' },
    { icon: UserRound, value: yearLabel(voter.yearLevel).replace(' Year', ''), label: 'Year level' },
    { icon: CheckSquare, value: hasVoted ? `${STUDENT_RACES}/${STUDENT_RACES}` : `0/${STUDENT_RACES}`, label: 'Selected' },
  ], [hasVoted, voter.yearLevel]);

  const dates = [
    { icon: CalendarClock, title: 'Voting period', body: 'Follow the official election committee schedule.' },
    { icon: Clock3, title: 'Registration status', body: 'Your verified profile is active for this election.' },
    { icon: BarChart3, title: 'Results published', body: 'Official tallies appear after the committee publishes results.' },
    { icon: CheckSquare, title: 'Your status', body: hasVoted ? 'Ballot recorded and locked.' : 'Registered & verified.' },
  ];

  return (
    <section className="panel on">
      <header className="head">
        <div>
          <span className="eyebrow">Voter dashboard</span>
          <h1>Welcome back, <span className="grad">{firstName(voter.fullName)}</span></h1>
          <p>Here&apos;s everything for the 2026 CSS Department student election.</p>
        </div>
      </header>

      <div className={`student-status${hasVoted ? ' is-complete voted' : ''}`}>
        <div>
          <span className="st-badge"><span className="d" />{hasVoted ? 'Vote recorded' : 'Not yet voted'}</span>
          <h2>{hasVoted ? 'Your ballot has been submitted' : 'Your ballot is ready'}</h2>
          <p>
            {hasVoted
              ? 'Thanks for voting! Official results are published after polls close.'
              : `You haven't cast your vote yet. It only takes a minute — ${STUDENT_RACES} races, one verified submission.`}
          </p>
        </div>
        <div className="actions">
          <a className="btn btn-primary" href="/vote">
            {hasVoted ? 'View ballot status' : 'Go to your ballot'} <span className="arr">→</span>
          </a>
        </div>
      </div>

      <div className="student-facts facts">
        {facts.map(({ icon: Icon, value, label }) => (
          <article className="fact" key={label}>
            <span className="ic"><Icon size={20} aria-hidden="true" /></span>
            <div>
              <div className="num grad">{value}</div>
              <div className="lbl">{label}</div>
            </div>
          </article>
        ))}
      </div>

      <div>
        <div className="sec-title">
          <h3>Key dates</h3>
          <p>All times follow official committee announcements.</p>
        </div>
        <div className="lead-grid student-card-grid" style={{ marginTop: 16 }}>
          {dates.map(({ icon: Icon, title, body }) => (
            <article className="lead" key={title}>
              <span className="ic"><Icon size={21} aria-hidden="true" /></span>
              <div>
                <span className="spec">{title}</span>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="actions">
        <a className="btn btn-ghost" href="/results" aria-disabled={!hasVoted && undefined}>
          View results{hasVoted ? '' : ' (after polls close)'}
        </a>
      </div>
    </section>
  );
}

function ProfilePanel({
  voter,
  hasVoted,
  onSignOut,
}: {
  voter: VoterProfile;
  hasVoted: boolean;
  onSignOut: () => void;
}) {
  const rows = [
    ['Full name', voter.fullName],
    ['Student ID', voter.studentNo || 'Registered voter'],
    ['Email', voter.email],
    ['Year level', yearLabel(voter.yearLevel)],
    ['Section', voter.section],
    ['Voting status', hasVoted ? 'Vote recorded' : 'Not yet voted'],
  ];
  const votedAt = formatRecordDate(voter.votedAt);

  return (
    <section className="panel on">
      <header className="head">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Your <span className="grad">profile</span></h1>
          <p>Your registration details for this election.</p>
        </div>
      </header>

      <div className="student-profile-head pavatar">
        <span className="student-avatar is-large">{initials(voter.fullName)}</span>
        <div>
          <h2>{voter.fullName}</h2>
          <p>{voter.eligible ? 'Verified voter' : 'Eligibility pending'} · {voter.section}</p>
        </div>
      </div>

      <dl className="student-profile-list plist">
        {rows.map(([label, value]) => (
          <div className="profile-row prow" key={label}>
            <dt>{label}</dt>
            <dd className={label === 'Voting status' && hasVoted ? 'ok' : ''}>{value}</dd>
          </div>
        ))}
      </dl>

      {votedAt && (
        <div className="receipt">Ballot recorded — <b>ref {ELECTION_ID.toUpperCase()}</b> · submitted {votedAt}. Your choices remain secret.</div>
      )}

      <div className="actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  );
}

function HistoryPanel({ voter, hasVoted }: { voter: VoterProfile; hasVoted: boolean }) {
  const [open, setOpen] = useState(hasVoted);
  const votedAt = formatRecordDate(voter.votedAt);

  return (
    <section className="panel on">
      <header className="head">
        <div>
          <span className="eyebrow">Record</span>
          <h1>Poll <span className="grad">history</span></h1>
          <p>Elections you&apos;ve taken part in and how you voted. This private record is visible only to you.</p>
        </div>
      </header>

      <div className="hist">
        <article className={`hpoll${open ? ' open' : ''}`}>
          <button
            className="hpoll-head"
            type="button"
            aria-expanded={open}
            disabled={!hasVoted}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="hicon"><Vote size={20} aria-hidden="true" /></span>
            <span className="hmeta">
              <b>CSS Department Election 2026</b>
              <small>{votedAt || 'Current election'}</small>
            </span>
            <span className={`htag ${hasVoted ? 'accent' : ''}`}>{hasVoted ? 'Voted' : 'Did not vote'}</span>
            {hasVoted && <ChevronDown className="chev" size={18} aria-hidden="true" />}
          </button>
          {hasVoted && (
            <div className="hvotes">
              <div className="hv-inner">
                <div className="hvote"><span>Participation</span><b>Recorded</b></div>
                <div className="hvote"><span>Ballot choices</span><b className="abstain">Private</b></div>
                <div className="hvote"><span>Reference</span><b>{ELECTION_ID.toUpperCase()}</b></div>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
