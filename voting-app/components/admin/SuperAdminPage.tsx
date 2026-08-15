'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
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
import { buildAggregate } from '@/lib/admin/adminCore';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { watchAudit } from '@/lib/admin/adminData';
import { AUDIT_ACTION_LABELS, auditDetail } from '@/lib/admin/auditPresentation';
import { DEFAULT_APP_CONFIG, watchAppConfig } from '@/lib/appConfig';
import { hasSuperAdminClaim } from '@/lib/auth/guards-core';
import { ELECTION_ID } from '@/lib/constants';
import { positionGroup } from '@/lib/election/candidates';
import { formatTimestamp } from '@/lib/format';
import {
  grantAdmin,
  createAdminAccount,
  revokeAdmin,
  updateElectionTitle,
  watchAdmins,
  watchAllElections,
} from '@/lib/superadmin/superadminData';
import { useAdminElectionData } from '@/components/admin/console/useAdminElectionData';
import type { CustomSelectOption } from '@/components/ui/CustomSelect';
import type { OneTimeVoteFonts } from '@/components/voter/OneTimeVoteForm';
import type { AdminEntry, AppConfig, AuditEntry, Election } from '@/lib/types';

type SuperTab = 'dashboard' | 'admins' | 'elections' | 'audit' | 'settings';

const MIN_REASON_LENGTH = 8; // mirrored by the validAdminGrant security rule
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailInitials(email: string): string {
  const name = email.split('@')[0] || 'Admin';
  return name.slice(0, 2).toUpperCase();
}

const TABS: { key: SuperTab; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'admins', label: 'Admins', icon: Users },
  { key: 'elections', label: 'Elections', icon: Vote },
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
            {liveData.loading && <p className="superadmin-data-loading" role="status">Loading live election data…</p>}
            {dataError && <p className="form-message is-error" role="alert">{dataError}</p>}
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
            {activeTab === 'admins' && <AdminsPanel admins={admins} actorUid={actorUid} actorEmail={actorEmail} />}
            {activeTab === 'elections' && <ElectionsPanel elections={elections} actorUid={actorUid} />}
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

const ELECTION_STATUS_LABELS: Record<Election['status'], string> = {
  draft: 'draft',
  open: 'active',
  closed: 'closed',
  published: 'published',
};

function ElectionsPanel({ elections, actorUid }: { elections: Election[]; actorUid: string }) {
  const [editingId, setEditingId] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const ordered = useMemo(
    () => [...elections].sort((a, b) => (a.id === ELECTION_ID ? -1 : b.id === ELECTION_ID ? 1 : a.id.localeCompare(b.id))),
    [elections],
  );

  async function saveTitle(electionId: string) {
    if (!title.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateElectionTitle(electionId, title, actorUid);
      setNotice({ text: 'Election title updated.' });
      setEditingId('');
    } catch (error) {
      setNotice({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Cycles</span>
          <h1>Elections</h1>
          <p>Live election records. Lifecycle (open, close, publish) is controlled from the admin console.</p>
        </div>
      </header>
      <NoticeLine notice={notice} />
      {ordered.length === 0 ? (
        <div className="state-block">
          <strong>No elections found</strong>
          <small>The election document is created during deployment seeding.</small>
        </div>
      ) : (
        <div className="superadmin-list">
          {ordered.map((election) => (
            <div className="superadmin-row" key={election.id}>
              <Vote size={20} />
              <div>
                {editingId === election.id ? (
                  <form
                    className="field"
                    onSubmit={(event) => { event.preventDefault(); void saveTitle(election.id); }}
                  >
                    <span className="sr-only">Election title</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
                  </form>
                ) : (
                  <strong>{election.title || election.id}</strong>
                )}
                <p>
                  {election.id}
                  {election.id === ELECTION_ID ? ' · current election' : ''}
                  {' · registration '}{election.registrationOpen === false ? 'closed' : 'open'}
                </p>
              </div>
              <div className="superadmin-actions">
                <span className={`tag ${election.status === 'open' ? 'active' : election.status}`}>{ELECTION_STATUS_LABELS[election.status] ?? election.status}</span>
                {editingId === election.id ? (
                  <>
                    <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setEditingId('')}>Cancel</button>
                    <button className="btn btn-primary btn-sm" type="button" disabled={busy || !title.trim()} onClick={() => void saveTitle(election.id)}>
                      {busy ? 'Saving…' : 'Save title'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      onClick={() => { setEditingId(election.id); setTitle(election.title ?? ''); setNotice(null); }}
                    >
                      Rename
                    </button>
                    <a className="btn btn-primary btn-sm" href="/admin">Manage</a>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
