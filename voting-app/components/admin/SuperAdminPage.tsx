'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  Contact,
  Database,
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Menu,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import AccessDeniedScreen from '@/components/AccessDeniedScreen';
import BrandMark from '@/components/BrandMark';
import SuperAdminResultsFeature from '@/components/admin/SuperAdminResultsFeature';
import { DesignOverviewSection } from '@/components/admin/SuperAdminDesignTest';
import RouteLoading from '@/components/RouteLoading';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import LiveDataStatus from '@/components/admin/console/LiveDataStatus';
import BackupCenter from '@/components/admin/console/BackupCenter';
import CandidateImportPanel from '@/components/admin/console/CandidateImportPanel';
import DatabaseDoctor from '@/components/admin/console/DatabaseDoctor';
import ElectionManagementPanel from '@/components/admin/console/ElectionManagementPanel';
import ExportCenter from '@/components/admin/console/ExportCenter';
import PositionsPanel from '@/components/admin/console/PositionsPanel';
import { downloadFile } from '@/components/admin/console/shared';
import { auditToCsv, buildAggregate, resultsToCsv, votersToCsv } from '@/lib/admin/adminCore';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { watchAudit } from '@/lib/admin/adminData';
import { AUDIT_ACTION_LABELS, auditDetail } from '@/lib/admin/auditPresentation';
import { DEFAULT_APP_CONFIG, watchAppConfig } from '@/lib/appConfig';
import { hasSuperAdminClaim } from '@/lib/auth/guards-core';
import { ELECTION_ID, SECTION_LETTERS_BY_YEAR } from '@/lib/constants';
import { positionGroup } from '@/lib/election/candidates';
import { formatTimestamp, yearLabel } from '@/lib/format';
import {
  grantAdmin,
  createAdminAccount,
  resetVoterRegistration,
  revokeAdmin,
  watchAdmins,
  watchAllElections,
} from '@/lib/superadmin/superadminData';
import { useAdminElectionData } from '@/components/admin/console/useAdminElectionData';
import type { CustomSelectOption } from '@/components/ui/CustomSelect';
import type { OneTimeVoteFonts } from '@/components/voter/OneTimeVoteForm';
import type { AdminEntry, AppConfig, AuditEntry, Candidate, Election, Position, Voter } from '@/lib/types';
import type { ResultsCounts } from '@/lib/admin/adminCore';

type SuperTab = 'dashboard' | 'oversight' | 'admins' | 'voters' | 'elections' | 'audit' | 'settings' | 'backups' | 'doctor' | 'export';

const MIN_REASON_LENGTH = 8; // mirrored by the validAdminGrant security rule
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailInitials(email: string): string {
  const name = email.split('@')[0] || 'Admin';
  return name.slice(0, 2).toUpperCase();
}

const TABS: { key: SuperTab; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'oversight', label: 'Positions & candidates', icon: ListChecks },
  { key: 'admins', label: 'Admins', icon: Users },
  { key: 'voters', label: 'Voters', icon: Contact },
  { key: 'elections', label: 'Elections', icon: Vote },
  { key: 'backups', label: 'Backups & reset', icon: Database },
  { key: 'doctor', label: 'Database doctor', icon: Stethoscope },
  { key: 'export', label: 'Export center', icon: Download },
  { key: 'audit', label: 'Audit log', icon: FileText },
  { key: 'settings', label: 'Settings', icon: Settings },
];

/**
 * Injects font-family overrides onto the <body> element so the custom fonts
 * (Figtree, JetBrains Mono) are applied across the entire page — including
 * portaled elements like modals and the CustomSelect dropdown.
 *
 * The shared --font / --font-body / --font-mono chain in theme.css is computed
 * once at :root, so an inherited --font-figtree override never reaches
 * font-family through it. We apply the loaded families directly to <body>
 * while this component is mounted; the previous inline values are restored on
 * unmount so other pages stay untouched.
 */
function useGlobalFontInjector(fonts: OneTimeVoteFonts) {
  useEffect(() => {
    const body = document.body;
    const figtreeStack = `${fonts.figtree}, "Figtree", "Segoe UI", Arial, sans-serif`;
    const monoStack = `${fonts.jetBrainsMono}, "JetBrains Mono", ui-monospace, monospace`;
    const overrides: Record<string, string> = {
      '--font-figtree': fonts.figtree,
      '--font-jetbrains-mono': fonts.jetBrainsMono,
      '--font': figtreeStack,
      '--font-body': figtreeStack,
      '--font-display': figtreeStack,
      '--mono': monoStack,
      '--font-mono': monoStack,
    };

    const previous = new Map<string, string>();
    for (const [prop, value] of Object.entries(overrides)) {
      previous.set(prop, body.style.getPropertyValue(prop));
      body.style.setProperty(prop, value);
    }

    return () => {
      for (const [prop, value] of previous) {
        if (value) {
          body.style.setProperty(prop, value);
        } else {
          body.style.removeProperty(prop);
        }
      }
    };
  }, [fonts.figtree, fonts.jetBrainsMono]);
}

export default function SuperAdminPage({ fonts }: { fonts: OneTimeVoteFonts }) {
  useGlobalFontInjector(fonts);
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    // Signed out → send to sign-in (not a 403). 403 is only for a signed-in
    // account that lacks super admin access.
    if (!current.user) return { kind: 'redirect', to: '/admin/auth' };
    if (!hasSuperAdminClaim(current.claims)) return { kind: 'deny', reason: 'This account does not have super admin access.' };
    return { kind: 'allow' };
  }, 'Unable to verify super admin credentials.');
  const [activeTab, setActiveTab] = useState<SuperTab>('dashboard');
  const [oversightSection, setOversightSection] = useState<'overview' | 'positions' | 'import'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [elections, setElections] = useState<Election[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [dataError, setDataError] = useState('');
  const liveData = useAdminElectionData(status === 'ready');

  const actorUid = session?.user?.uid ?? '';
  const actorEmail = (session?.user?.email ?? 'super').toLowerCase();
  const electionTitle = liveData.election?.title ?? 'CSS Department Election';
  const liveAggregate = useMemo(
    () => buildAggregate({
      results: liveData.results,
      candidates: liveData.candidates,
      positions: liveData.positions,
      voters: liveData.voters,
      electionId: ELECTION_ID,
    }),
    [liveData.results, liveData.candidates, liveData.positions, liveData.voters],
  );
  const livePositionOptions = useMemo<CustomSelectOption[]>(
    () => liveData.positions.map((position) => ({
      value: position.id,
      label: `${position.order}. ${position.name}`,
      group: positionGroup(position) === 'exec' ? 'Executive' : positionGroup(position) === 'cmte' ? 'Committees' : 'Year Representatives',
    })),
    [liveData.positions],
  );
  const activeCandidates = liveData.candidates.filter((candidate) => candidate.active).length;
  const positionsCovered = liveData.positions.filter((position) => liveData.candidates.some((candidate) => candidate.positionId === position.id && candidate.active)).length;
  const setupReady = liveData.positions.length > 0 && positionsCovered === liveData.positions.length && liveAggregate.eligible.total > 0;
  const turnoutPercent = liveAggregate.eligible.total > 0
    ? Math.round((liveAggregate.turnout.total / liveAggregate.eligible.total) * 100)
    : 0;

  useEffect(() => {
    if (status !== 'ready') return;
    const onError = (error: Error) => setDataError(error.message);
    const unsubscribers = [
      watchAdmins(setAdmins, onError),
      watchAllElections(setElections, onError),
      watchAudit(setAuditEntries, onError, 50),
      watchAppConfig(setConfig, onError),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [status]);

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

  if (status === 'loading') {
    return <RouteLoading />;
  }

  if (status === 'denied') {
    return (
      <AccessDeniedScreen
        eyebrow="Super admin route"
        reason={deniedReason}
        refNote="superadmin credentials required"
        titleId="superadmin-denied-title"
        actions={session?.user && <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>}
      />
    );
  }

  return (
    <>
      <div className="topbar">
        <a className="terminal-brand" href="/">
          <BrandMark />
          <span className="nav-brand-text">
            <strong>CSS Voting</strong>
            <small>Super Admin</small>
          </span>
        </a>
        <button className="menu-btn" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>
      <div className={`scrim${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} aria-hidden="true" />

      <div className="shell">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Super admin navigation">
          <div className="side-brand">
            <BrandMark />
            <span className="nav-brand-text">
              <strong>CSS Voting</strong>
              <small>Control Center</small>
            </span>
          </div>

          <span className="super-badge"><span className="d" />Super Admin</span>

          <nav className="side-nav" aria-label="Super admin sections">
            <span className="side-cap">{'// system'}</span>
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                className={`item${activeTab === key ? ' on' : ''}`}
                type="button"
                aria-current={activeTab === key ? 'page' : undefined}
                onClick={() => {
                  setActiveTab(key);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </button>
            ))}
            <span className="side-cap">{'// shortcuts'}</span>
            <a className="item" href="/admin">
              <ShieldCheck size={18} aria-hidden="true" />
              Admin console
              <ExternalLink className="ext" size={14} aria-hidden="true" />
            </a>
          </nav>

          <div className="side-foot">
            <div className="who">
              <span className="av">{emailInitials(actorEmail)}</span>
              <div>
                <b>Super admin</b>
                <small>{actorEmail}</small>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={signOutToHome}>
              <LogOut size={14} style={{ marginRight: 6 }} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          <section className="panel on superadmin-panel">
            <LiveDataStatus loading={liveData.loading} error={dataError} />
            {activeTab === 'dashboard' && (
              <div className="superadmin-applied-design">
                {liveData.positions.length > 0 && (
                  <SuperAdminResultsFeature
                    aggregate={liveAggregate}
                    candidates={liveData.candidates}
                    positions={liveData.positions}
                    positionOptions={livePositionOptions}
                    electionTitle={electionTitle}
                  />
                )}
                <DesignOverviewSection
                  election={liveData.election}
                  aggregate={liveAggregate}
                  activeCandidates={activeCandidates}
                  positionsCovered={positionsCovered}
                  setupReady={setupReady}
                  turnoutPercent={turnoutPercent}
                  positionsCount={liveData.positions.length}
                />
              </div>
            )}
            {activeTab === 'oversight' && (
              <>
                <div className="pos-switch" role="group" aria-label="Oversight section">
                  {([['overview', 'Overview'], ['positions', 'Positions'], ['import', 'Import candidates']] as const).map(([key, label]) => (
                    <button key={key} className={oversightSection === key ? 'on' : ''} type="button" aria-pressed={oversightSection === key} onClick={() => setOversightSection(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                {oversightSection === 'overview' && (
                  <OversightPanel
                    positions={liveData.positions}
                    candidates={liveData.candidates}
                    results={liveData.results}
                    electionTitle={electionTitle}
                  />
                )}
                {oversightSection === 'positions' && <PositionsPanel positions={liveData.positions} />}
                {oversightSection === 'import' && <CandidateImportPanel />}
              </>
            )}
            {activeTab === 'admins' && <AdminsPanel admins={admins} actorUid={actorUid} actorEmail={actorEmail} />}
            {activeTab === 'voters' && <VotersPanel voters={liveData.voters} actorUid={actorUid} />}
            {activeTab === 'elections' && <ElectionManagementPanel elections={elections} positions={liveData.positions} />}
            {activeTab === 'backups' && <BackupCenter />}
            {activeTab === 'doctor' && <DatabaseDoctor />}
            {activeTab === 'export' && (
              <ExportCenter
                candidates={liveData.candidates}
                positions={liveData.positions}
                voters={liveData.voters}
                roster={liveData.students}
                results={liveData.results}
                auditEntries={auditEntries}
              />
            )}
            {activeTab === 'audit' && <AuditPanel entries={auditEntries} />}
            {activeTab === 'settings' && <SettingsPanel config={config} actorUid={actorUid} />}
          </section>
        </main>
      </div>
    </>
  );
}

interface ReasonDialogState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  action: (reason: string) => Promise<void>;
}

/** Confirmation dialog for privileged actions; the reason is written to the audit log. */
function ReasonDialog({ state, onClose }: { state: ReasonDialogState | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state) return;
    setReason('');
    setError('');
    fieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;
  const reasonReady = reason.trim().length >= MIN_REASON_LENGTH;

  async function confirm() {
    if (!reasonReady || busy) return;
    setBusy(true);
    setError('');
    try {
      await state!.action(reason.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message || 'The action was rejected.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm-overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
        <div className={`confirm-icon ${state.danger ? 'danger' : 'amber'}`}>
          {state.danger ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}
        </div>
        <h2 id="reason-dialog-title">{state.title}</h2>
        <p>{state.body}</p>
        <div className="confirm-consequence">
          This privileged action is written to the immutable audit log with your reason.
        </div>
        <label className="confirm-field">
          <span>Reason</span>
          <textarea ref={fieldRef} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this change needed?" />
          <small className="confirm-reason-hint">
            {reasonReady ? 'Reason will be written to the audit log.' : `At least ${MIN_REASON_LENGTH} characters (${reason.trim().length}/${MIN_REASON_LENGTH}).`}
          </small>
        </label>
        {error && <p className="form-message is-error" role="alert">{error}</p>}
        <div className="confirm-actions">
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className={state.danger ? 'btn btn-danger' : 'btn btn-amber'}
            type="button"
            disabled={!reasonReady || busy}
            onClick={confirm}
          >
            {busy ? 'Working…' : state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminsPanel({ admins, actorUid, actorEmail }: { admins: AdminEntry[]; actorUid: string; actorEmail: string }) {
  const [dialog, setDialog] = useState<ReasonDialogState | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const inviteEmailValid = EMAIL_PATTERN.test(inviteEmail.trim().toLowerCase());
  const alreadyAdmin = admins.some((admin) => admin.email === inviteEmail.trim().toLowerCase());
  const accountEmailValid = EMAIL_PATTERN.test(accountEmail.trim().toLowerCase());
  const accountPasswordValid = accountPassword.length >= 8;

  async function createAccount() {
    if (!accountEmailValid || !accountPasswordValid || accountBusy) return;
    setAccountBusy(true);
    setNotice(null);
    try {
      const email = accountEmail.trim().toLowerCase();
      await createAdminAccount({ email, password: accountPassword });
      setAccountEmail('');
      setAccountPassword('');
      setNotice({ text: `${email} can now sign in as an admin.` });
    } catch (error) {
      setNotice({ text: (error as Error).message || 'Unable to create the admin account.', error: true });
    } finally {
      setAccountBusy(false);
    }
  }

  function requestGrant() {
    const email = inviteEmail.trim().toLowerCase();
    if (!inviteEmailValid || alreadyAdmin) return;
    setDialog({
      title: `Grant admin access to ${email}?`,
      body: 'They can manage candidates, voters, results, and the election lifecycle the next time they sign in.',
      confirmLabel: 'Grant admin access',
      action: async (reason) => {
        await grantAdmin({ email, reason, actorUid });
        setInviteEmail('');
        setNotice({ text: `${email} now has admin access.` });
      },
    });
  }

  function requestRevoke(admin: AdminEntry) {
    setDialog({
      title: `Revoke admin access for ${admin.email}?`,
      body: 'They immediately lose access to the admin console and all admin operations.',
      confirmLabel: 'Revoke access',
      danger: true,
      action: async (reason) => {
        await revokeAdmin({ email: admin.email, reason, actorUid });
        setNotice({ text: `Admin access revoked for ${admin.email}.` });
      },
    });
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Access control</span>
          <h1>Admins</h1>
          <p>Grant or revoke who can run elections. Changes take effect on the next sign-in and are audit-logged.</p>
        </div>
      </header>
      <NoticeLine notice={notice} />
      <div className="student-facts">
        {[
          { icon: Users, value: String(admins.length + 1), label: 'Total admins' },
          { icon: ShieldCheck, value: '1', label: 'Super admin' },
          { icon: CalendarClock, value: String(admins.length), label: 'Runtime grants' },
        ].map(({ icon: Icon, value, label }) => (
          <article className="fact" key={label}>
            <span className="ic"><Icon size={20} /></span>
            <div><div className="num grad">{value}</div><div className="lbl">{label}</div></div>
          </article>
        ))}
      </div>

      <div className="block-label">
        <h2>Create admin account</h2>
        <small>email and password</small>
      </div>
      <form
        className="two-col admin-account-form"
        onSubmit={(event) => { event.preventDefault(); void createAccount(); }}
      >
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="off"
            placeholder="admin@example.com"
            value={accountEmail}
            onChange={(event) => { setAccountEmail(event.target.value); setNotice(null); }}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={accountPassword}
            onChange={(event) => { setAccountPassword(event.target.value); setNotice(null); }}
          />
        </label>
        <div className="field">
          <span aria-hidden="true">&nbsp;</span>
          <button className="btn btn-primary" type="submit" disabled={!accountEmailValid || !accountPasswordValid || accountBusy}>
            {accountBusy ? 'Creating…' : 'Create admin account'}
          </button>
        </div>
      </form>

      <div className="block-label">
        <h2>Grant admin access</h2>
        <small>by sign-in email</small>
      </div>
      <form
        className="two-col admin-grant-form"
        onSubmit={(event) => { event.preventDefault(); requestGrant(); }}
      >
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            placeholder="name.scc@gmail.com"
            value={inviteEmail}
            onChange={(event) => { setInviteEmail(event.target.value); setNotice(null); }}
          />
          {inviteEmail && !inviteEmailValid && <span className="field-error">Enter a valid email address.</span>}
          {alreadyAdmin && <span className="field-error">This email already has admin access.</span>}
        </label>
        <div className="field">
          <span aria-hidden="true">&nbsp;</span>
          <button className="btn btn-primary" type="submit" disabled={!inviteEmailValid || alreadyAdmin}>
            + Grant admin
          </button>
        </div>
      </form>

      <div className="superadmin-list" aria-label="Admin accounts">
        <div className="block-label">
          <h2>Admin accounts</h2>
          <small>{admins.length + 1} total</small>
        </div>
        <div className="superadmin-row admin-account-row">
          <span className="student-avatar">{emailInitials(actorEmail)}</span>
          <div>
            <strong>{actorEmail}</strong>
            <p>Root of trust — managed by deployment script (set-superadmin.mjs), not from this page.</p>
          </div>
          <div className="superadmin-actions">
            <span className="tag super">Super admin</span>
          </div>
        </div>
        {admins.length === 0 ? (
          <div className="state-block">
            <strong>No runtime admins yet</strong>
            <small>Grant admin access by email above — no redeploy needed.</small>
          </div>
        ) : (
          admins.map((admin) => (
            <div className="superadmin-row admin-account-row" key={admin.id}>
              <span className="student-avatar">{emailInitials(admin.email)}</span>
              <div>
                <strong>{admin.email}</strong>
                <p>Granted {formatTimestamp(admin.createdAt) || 'just now'} · {admin.reason}</p>
              </div>
              <div className="superadmin-actions">
                <span className="tag">Admin</span>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => requestRevoke(admin)}>Revoke</button>
              </div>
            </div>
          ))
        )}
      </div>
      <ReasonDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

function nameInitials(fullName: string): string {
  return fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'V';
}

interface RosterIssue {
  kind: 'empty' | 'dupe' | 'year' | 'section';
  position: Position;
  label: string;
  detail: string;
}

/** Positions/candidates oversight: roster sanity checks + official tally export. */
function OversightPanel({ positions, candidates, results, electionTitle }: {
  positions: Position[];
  candidates: Candidate[];
  results: ResultsCounts;
  electionTitle: string;
}) {
  const issues = useMemo<RosterIssue[]>(() => {
    const found: RosterIssue[] = [];
    const candidatesById = new Map(candidates.map((c) => [c.id, c]));

    // 1. Positions with no active candidate
    for (const position of positions) {
      const hasActive = candidates.some((c) => c.positionId === position.id && c.active);
      if (!hasActive) {
        found.push({
          kind: 'empty',
          position,
          label: 'No active candidate',
          detail: `${position.order}. ${position.name} has no candidate visible on the ballot.`,
        });
      }
    }

    // 2. Duplicate candidate names within a position
    for (const position of positions) {
      const names = candidates
        .filter((c) => c.positionId === position.id)
        .map((c) => c.name.trim().toLowerCase());
      const seen = new Set<string>();
      const dupes = new Set<string>();
      for (const name of names) {
        if (seen.has(name)) dupes.add(name);
        seen.add(name);
      }
      if (dupes.size > 0) {
        found.push({
          kind: 'dupe',
          position,
          label: 'Duplicate names',
          detail: `${position.name}: ${[...dupes].join(', ')}`,
        });
      }
    }

    // 3. Year-scope positions with a candidate from the wrong year level
    for (const candidate of candidates) {
      const position = positions.find((p) => p.id === candidate.positionId);
      if (!position) continue;
      if (position.scope === 'year' && position.yearLevel && candidate.yearLevel !== position.yearLevel) {
        found.push({
          kind: 'year',
          position,
          label: 'Year mismatch',
          detail: `${candidate.name} (${yearLabel(candidate.yearLevel)}) filed under ${position.name} (${yearLabel(position.yearLevel)}).`,
        });
      }
    }

    // 4. Section letter outside the year's allowed range
    for (const candidate of candidates) {
      const letters = SECTION_LETTERS_BY_YEAR[candidate.yearLevel] ?? [];
      if (letters.length === 0) continue;
      const letter = candidate.section.replace(/^BSCS-\d/i, '').trim().toUpperCase();
      if (letter && !letters.includes(letter)) {
        found.push({
          kind: 'section',
          position: positions.find((p) => p.id === candidate.positionId) ?? { id: '', name: 'Unknown position', scope: 'department', order: 0 },
          label: 'Section out of range',
          detail: `${candidate.name} (${candidate.section}) — year ${candidate.yearLevel} only has sections A–${letters[letters.length - 1]}.`,
        });
      }
    }

    return found;
  }, [positions, candidates]);

  const emptyCount = issues.filter((i) => i.kind === 'empty').length;
  const issueCount = issues.length;
  const activeCandidates = candidates.filter((c) => c.active).length;
  const coveredPositions = positions.filter((p) => candidates.some((c) => c.positionId === p.id && c.active)).length;

  const ISSUE_META: Record<RosterIssue['kind'], { label: string; className: string }> = {
    empty: { label: 'No candidate', className: 'err' },
    dupe: { label: 'Duplicate', className: 'warn' },
    year: { label: 'Year', className: 'warn' },
    section: { label: 'Section', className: 'warn' },
  };

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Roster integrity</span>
          <h1>Positions &amp; candidates</h1>
          <p>{positions.length} positions · {activeCandidates} active candidates · {coveredPositions}/{positions.length} covered. Sanity checks flag gaps that would show up on the ballot.</p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => downloadFile(`css-tally-${ELECTION_ID}.csv`, resultsToCsv({ results, candidates, positions }), 'text/csv;charset=utf-8')}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            Tally CSV
          </button>
        </div>
      </header>

      <div className="student-facts">
        {[
          { icon: ListChecks, value: String(positions.length), label: 'Positions' },
          { icon: Users, value: String(activeCandidates), label: 'Active candidates' },
          { icon: TriangleAlert, value: issueCount === 0 ? '0' : String(issueCount), label: issueCount === 0 ? 'All clear' : 'Open issues' },
        ].map(({ icon: Icon, value, label }) => (
          <article className="fact" key={label}>
            <span className="ic"><Icon size={20} /></span>
            <div><div className={`num${issueCount > 0 && label === 'Open issues' ? ' grad' : ''}`}>{value}</div><div className="lbl">{label}</div></div>
          </article>
        ))}
      </div>

      {issueCount === 0 ? (
        <div className="state-block">
          <strong>Roster looks clean</strong>
          <small>Every position has an active candidate, no duplicate names, and all years/sections line up with the ballot rules.</small>
        </div>
      ) : (
        <div className="superadmin-list" aria-label="Roster issues">
          <div className="block-label">
            <h2>{issueCount} issue{issueCount === 1 ? '' : 's'} found</h2>
            <small>{emptyCount > 0 ? `${emptyCount} unfilled position${emptyCount === 1 ? '' : 's'} · ` : ''}fix these before opening the ballot</small>
          </div>
          {issues.map((issue, index) => {
            const meta = ISSUE_META[issue.kind];
            return (
              <div className="superadmin-row" key={`${issue.kind}-${issue.position.id}-${index}`}>
                <span className={`tag ${meta.className}`}>{meta.label}</span>
                <div>
                  <strong>{issue.label}</strong>
                  <p>{issue.detail}</p>
                </div>
                <div className="superadmin-actions">
                  <span className="tag">{issue.position.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Voter exception handling: search the registry and reset broken registrations. */
function VotersPanel({ voters, actorUid }: { voters: Voter[]; actorUid: string }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'voted' | 'pending'>('all');
  const [dialog, setDialog] = useState<ReasonDialogState | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const votedCount = voters.filter((voter) => voter.hasVoted?.[ELECTION_ID] === true).length;

  const filteredVoters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return voters.filter((voter) => {
      if (filter === 'voted' && voter.hasVoted?.[ELECTION_ID] !== true) return false;
      if (filter === 'pending' && voter.hasVoted?.[ELECTION_ID] === true) return false;
      return `${voter.fullName} ${voter.studentNo ?? ''} ${voter.email} ${voter.section}`.toLowerCase().includes(needle);
    });
  }, [search, voters, filter]);

  function requestReset(voter: Voter) {
    setDialog({
      title: `Reset registration for ${voter.fullName}?`,
      body: `Deletes the voter record and frees ${voter.studentNo ?? 'their student number'} / ${voter.email} so they can register again. Use only for genuinely broken registrations (e.g. a typo'd student number or email).`,
      confirmLabel: 'Reset registration',
      danger: true,
      action: async (reason) => {
        await resetVoterRegistration({ uid: voter.id, reason, actorUid });
        setNotice({ text: `Registration reset for ${voter.fullName}.` });
      },
    });
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Exception handling</span>
          <h1>Voters</h1>
          <p>{voters.length} registered · {votedCount} voted. Reset frees a broken one-time registration (student number + email) for a fresh attempt.</p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={filteredVoters.length === 0}
            onClick={() => downloadFile(`css-voters-${filter}-${ELECTION_ID}.csv`, votersToCsv(filteredVoters, ELECTION_ID), 'text/csv;charset=utf-8')}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            Export CSV
          </button>
        </div>
      </header>
      <NoticeLine notice={notice} />
      <div className="pos-switch" role="group" aria-label="Filter voters by status">
        {([['all', 'All'], ['voted', 'Voted'], ['pending', 'Not yet voted']] as const).map(([key, label]) => (
          <button key={key} className={filter === key ? 'on' : ''} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="field" style={{ maxWidth: 420 }}>
        <span className="sr-only">Search voters</span>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <Search size={16} style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', color: 'var(--muted)' }} aria-hidden="true" />
          <input
            aria-label="Search voters by name, student number, email, or section"
            placeholder="Search name, student no., email, section…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 40 }}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {filteredVoters.length === 0 ? (
        <div className="state-block">
          <strong>No voters found</strong>
          <small>{voters.length ? 'Try another search or filter.' : 'Registered voters will appear here.'}</small>
        </div>
      ) : (
        <div className="superadmin-list" aria-label="Registered voters">
          {filteredVoters.map((voter) => {
            const voted = voter.hasVoted?.[ELECTION_ID] === true;
            return (
              <div className="superadmin-row" key={voter.id}>
                <span className="student-avatar">{nameInitials(voter.fullName)}</span>
                <div>
                  <strong>{voter.fullName}</strong>
                  <p>
                    {voter.studentNo || '—'} · {voter.email} · {yearLabel(voter.yearLevel)} {voter.section}
                    {voter.guest ? ' · one-time' : ''}
                  </p>
                </div>
                <div className="superadmin-actions">
                  <span className={`tag${voted ? ' active' : ''}`}>{voted ? 'Voted' : 'Not yet'}</span>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    disabled={voted}
                    title={voted ? 'Cannot reset a voter who has already cast a ballot.' : 'Reset this registration'}
                    onClick={() => requestReset(voter)}
                  >
                    <RotateCcw size={14} style={{ marginRight: 6 }} />
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ReasonDialog state={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Traceability</span>
          <h1>Audit log</h1>
          <p>Immutable record of privileged actions across the admin console and this control center.</p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={entries.length === 0}
            onClick={() => downloadFile(`css-audit-${ELECTION_ID}.csv`, auditToCsv(entries), 'text/csv;charset=utf-8')}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            Export CSV
          </button>
        </div>
      </header>
      {entries.length === 0 ? (
        <div className="state-block">
          <strong>No audit entries yet</strong>
          <small>Privileged actions will appear here as they happen.</small>
        </div>
      ) : (
        <div className="hist">
          {entries.map((entry) => {
            const open = openIds.has(entry.id);
            const detail = auditDetail(entry);
            return (
              <div className={`hpoll${open ? ' open' : ''}`} key={entry.id}>
                <button
                  className="hpoll-head"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`audit-detail-${entry.id}`}
                  onClick={() => toggle(entry.id)}
                >
                  <span className="hicon"><FileText size={18} /></span>
                  <span className="hmeta">
                    <b>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}{detail ? ` ${detail}` : ''}</b>
                    <small>{formatTimestamp(entry.ts) || 'pending…'} · {entry.actorUid.slice(0, 8)}</small>
                  </span>
                  <span className={`htag${entry.actorRole === 'superadmin' ? ' accent' : ''}`}>{entry.actorRole ?? 'admin'}</span>
                  <ChevronDown className="chev" size={18} aria-hidden="true" />
                </button>
                <div className="hvotes" id={`audit-detail-${entry.id}`}>
                  <div className="hv-inner">
                    <div className="hvote">
                      <span>Target</span>
                      <b>{entry.target}</b>
                    </div>
                    <div className="hvote">
                      <span>Actor</span>
                      <b>{entry.actorUid}</b>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SettingsPanel({ config, actorUid }: { config: AppConfig; actorUid: string }) {
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  async function toggleFlag(key: 'allowGuestVoters' | 'maintenanceMode') {
    if (busyKey) return;
    setBusyKey(key);
    setNotice(null);
    try {
      const { saveAppConfig } = await import('@/lib/superadmin/superadminData');
      await saveAppConfig({ ...config, [key]: !config[key] }, actorUid);
      setNotice({ text: 'Settings saved.' });
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true });
    } finally {
      setBusyKey('');
    }
  }

  const rows: Array<{ key: 'allowGuestVoters' | 'maintenanceMode'; title: string; body: string; on: boolean }> = [
    {
      key: 'allowGuestVoters',
      title: 'Allow one-time voters',
      body: 'Enable single-use guest access on the sign-in card. Enforced by security rules.',
      on: config.allowGuestVoters,
    },
    {
      key: 'maintenanceMode',
      title: 'Maintenance mode',
      body: 'Show a maintenance notice on the landing page and pause the student ballot.',
      on: config.maintenanceMode,
    },
  ];

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h1>Settings</h1>
          <p>System-wide policy. Changes apply live and are written to the audit log.</p>
        </div>
      </header>
      <NoticeLine notice={notice} />
      <div className="settings-grid">
        <div className="setting-row">
          <div>
            <strong>Require .scc email</strong>
            <p>Only institutional emails may register. Permanently enforced by security rules.</p>
          </div>
          <button className="toggle on" type="button" disabled aria-label="Require .scc email (always on)" aria-pressed="true" />
        </div>
        {rows.map(({ key, title, body, on }) => (
          <div className="setting-row" key={key}>
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
            <button
              className={`toggle${on ? ' on' : ''}`}
              type="button"
              disabled={busyKey === key}
              aria-label={title}
              aria-pressed={on}
              onClick={() => void toggleFlag(key)}
            />
          </div>
        ))}
      </div>
      <div>
        <div className="block-label">
          <h2>Institution</h2>
        </div>
        <div className="two-col">
          <label className="field">
            <span>School</span>
            <input value="St. Clare College of Caloocan" readOnly />
          </label>
          <label className="field">
            <span>Department</span>
            <input value="Computer Science Department" readOnly />
          </label>
        </div>
      </div>
    </>
  );
}
