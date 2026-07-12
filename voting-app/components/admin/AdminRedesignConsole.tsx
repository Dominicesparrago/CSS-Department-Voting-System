'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CheckSquare,
  Clock3,
  LayoutDashboard,
  Menu,
  UserPlus,
  Users,
} from 'lucide-react';
import AccessDeniedScreen from '@/components/AccessDeniedScreen';
import BinaryRain from '@/components/BinaryRain';
import BrandMark from '@/components/BrandMark';
import RouteLoading from '@/components/RouteLoading';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { buildAggregate } from '@/lib/admin/adminCore';
import { hasAdminAccess } from '@/lib/auth/guards-core';
import { ELECTION_ID } from '@/lib/constants';
import { positionGroup } from '@/lib/election/candidates';
import { initials } from '@/lib/initials';
import CandidatesPanel from './console/CandidatesPanel';
import ConfirmDialog, { type ConfirmState } from './console/ConfirmDialog';
import LifecyclePanel from './console/LifecyclePanel';
import OverviewPanel from './console/OverviewPanel';
import ResultsPanel from './console/ResultsPanel';
import VotersPanel from './console/VotersPanel';
import { scrollToTop, type AdminPanel } from './console/shared';
import { useAdminElectionData } from './console/useAdminElectionData';

const POSITION_GROUP_LABELS = {
  exec: 'Executive',
  cmte: 'Committees',
  year: 'Year Representatives',
} as const;

const NAV_ITEMS: Array<{ key: AdminPanel; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'candidates', label: 'Candidates', icon: UserPlus },
  { key: 'voters', label: 'Voters', icon: Users },
  { key: 'results', label: 'Results', icon: BarChart3 },
  { key: 'lifecycle', label: 'Lifecycle', icon: Clock3 },
];

export default function AdminRedesignConsole() {
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    if (!current.user) return { kind: 'deny', reason: 'Please sign in with an admin account.' };
    if (!hasAdminAccess(current)) return { kind: 'deny', reason: 'This account does not have admin access.' };
    return { kind: 'allow' };
  }, 'Unable to verify admin credentials.');

  const [activePanel, setActivePanel] = useState<AdminPanel>('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const actorUid = session?.user?.uid ?? '';
  const actorEmail = session?.user?.email ?? 'admin';

  const {
    election,
    positions,
    candidates,
    voters,
    results,
    auditEntries,
    loading: dataLoading,
    errorMessage,
    refreshCandidates,
    refreshResults,
  } = useAdminElectionData(status === 'ready');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 959px)');
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) setDrawerOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // mobile drawer: lock scroll, trap focus, close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    document.body.classList.add('no-scroll');
    const focusable = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [],
    );
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) return;
      const direction = event.shiftKey ? -1 : 1;
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = (currentIndex + direction + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawerOpen]);

  const aggregate = useMemo(
    () => buildAggregate({ results, candidates, positions, voters, electionId: ELECTION_ID }),
    [results, candidates, positions, voters],
  );

  const positionOptions = useMemo(
    () => positions.map((position) => ({
      value: position.id,
      label: `${position.order}. ${position.name}`,
      group: POSITION_GROUP_LABELS[positionGroup(position)],
    })),
    [positions],
  );

  function switchPanel(panel: AdminPanel) {
    setActivePanel(panel);
    setDrawerOpen(false);
    scrollToTop();
  }

  if (status === 'loading') return <RouteLoading />;

  if (status === 'denied') {
    return (
      <AccessDeniedScreen
        eyebrow="Admin route"
        reason={deniedReason}
        refNote="admin credentials required"
        titleId="admin-denied-title"
        actions={session?.user && <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>}
      />
    );
  }

  return (
    <div id="admin-redesign">
      <BinaryRain id="rain" />
      <div className="topbar">
        <a className="brand" href="/" aria-label="CSS Voting home">
          <BrandMark className="mark" />
          <span><b>CSS Voting</b><small>Admin</small></span>
        </a>
        <button
          ref={menuButtonRef}
          className="menu-btn"
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="admin-redesign-sidebar"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <Menu className="icon" aria-hidden="true" />
        </button>
      </div>
      <div
        className={`scrim${drawerOpen ? ' open' : ''}`}
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
      />

      <div className="shell">
        <aside
          ref={sidebarRef}
          id="admin-redesign-sidebar"
          className={`sidebar${isMobile ? ' drawer' : ''}${drawerOpen ? ' open' : ''}`}
          aria-label="Admin navigation"
        >
          <div className="side-brand">
            <BrandMark className="mark" />
            <span className="brand"><span><b>CSS Voting</b><small>Admin Console</small></span></span>
          </div>
          <nav className="side-nav">
            <span className="side-cap">{'// election'}</span>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={activePanel === key ? 'on' : ''}
                type="button"
                data-t={key}
                aria-current={activePanel === key ? 'page' : undefined}
                onClick={() => switchPanel(key)}
              >
                <Icon className="icon" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <div className="who">
              <span className="av">{initials(actorEmail.split('@')[0], 'AD')}</span>
              <div>
                <b style={{ fontWeight: 600, color: 'var(--light)' }}>Admin</b><br />
                <span style={{ fontSize: '.7rem' }}>{actorEmail}</span>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </aside>

        <main className="main">
          {errorMessage && <p className="form-message is-error" role="alert">{errorMessage}</p>}
          {dataLoading && <p className="form-message" role="status">Loading live election data…</p>}

          <OverviewPanel
            active={activePanel === 'overview'}
            election={election}
            aggregate={aggregate}
            candidates={candidates}
            positions={positions}
            voters={voters}
            positionOptions={positionOptions}
            onNavigate={switchPanel}
          />
          <CandidatesPanel
            active={activePanel === 'candidates'}
            actorUid={actorUid}
            candidates={candidates}
            positions={positions}
            positionOptions={positionOptions}
            onRefreshCandidates={refreshCandidates}
            onRequestConfirm={setConfirmState}
          />
          <VotersPanel active={activePanel === 'voters'} voters={voters} />
          <ResultsPanel
            active={activePanel === 'results'}
            candidates={candidates}
            positions={positions}
            results={results}
            aggregate={aggregate}
            positionOptions={positionOptions}
            onRefresh={refreshResults}
          />
          <LifecyclePanel
            active={activePanel === 'lifecycle'}
            actorUid={actorUid}
            election={election}
            auditEntries={auditEntries}
            onRequestConfirm={setConfirmState}
          />
        </main>
      </div>

      <ConfirmDialog state={confirmState} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
