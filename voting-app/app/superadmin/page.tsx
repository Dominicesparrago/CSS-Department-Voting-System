'use client';

import BrandMark from '@/components/BrandMark';
import { useEffect, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileText,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { hasSuperAdminClaim } from '@/lib/auth/guards-core';
import RouteLoading from '@/components/RouteLoading';

type SuperTab = 'admins' | 'elections' | 'audit' | 'settings';

interface AuditEntry {
  time: string;
  actor: string;
  role: string;
  action: string;
  target: string;
}

const MIN_REASON_LENGTH = 8;

const INITIAL_AUDIT: AuditEntry[] = [
  { time: '18 Sep 09:40', actor: 'Dominic Esparrago', role: 'super', action: 'invited admin', target: 'j.ocampo.scc@gmail.com' },
  { time: '15 Sep 11:20', actor: 'Dominic Esparrago', role: 'super', action: 'created election', target: 'CSS Election 2026' },
  { time: '13 Sep 15:03', actor: 'Admin', role: 'admin', action: 'updated lifecycle', target: 'registration opened' },
];

function formatAuditTime(date: Date): string {
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(email: string): string {
  const name = email.split('@')[0] || 'Admin';
  return name.slice(0, 2).toUpperCase();
}

const TABS: { key: SuperTab; label: string; meta: string; icon: LucideIcon }[] = [
  { key: 'admins', label: 'Admins', meta: 'access control', icon: Users },
  { key: 'elections', label: 'Elections', meta: 'cycles', icon: Vote },
  { key: 'audit', label: 'Audit log', meta: 'traceability', icon: FileText },
  { key: 'settings', label: 'Settings', meta: 'policies', icon: Settings },
];

export default function SuperAdminPage() {
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    if (!current.user) return { kind: 'deny', reason: 'Please sign in with a super admin account.' };
    if (!hasSuperAdminClaim(current.claims)) return { kind: 'deny', reason: 'This account does not have super admin access.' };
    return { kind: 'allow' };
  }, 'Unable to verify super admin credentials.');
  const [activeTab, setActiveTab] = useState<SuperTab>('admins');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(INITIAL_AUDIT);

  function logAudit(entry: Omit<AuditEntry, 'time'>) {
    setAuditLog((current) => [{ ...entry, time: formatAuditTime(new Date()) }, ...current]);
  }

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
      <main className="page-shell superadmin-page">
        <section className="status-panel" data-spot>
          <p className="eyebrow">Super admin route</p>
          <h1>Access denied</h1>
          <p className="lede">{deniedReason}</p>
          <div className="action-row">
            <a className="btn btn-ghost" href="/">Back</a>
            <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </section>
      </main>
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
              <span className="av">{initials(session!.user!.email ?? 'super')}</span>
              <div>
                <b>Super admin</b>
                <small>{session!.user!.email ?? 'super'}</small>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={signOutToHome}>
              <LogOut size={14} style={{ marginRight: 6 }} />
              Sign out
            </button>
          </div>
        </aside>

        <main className="main">
          <section className="panel on">
            {activeTab === 'admins' && <AdminsPanel onLogAudit={logAudit} />}
            {activeTab === 'elections' && <ElectionsPanel />}
            {activeTab === 'audit' && <AuditPanel entries={auditLog} />}
            {activeTab === 'settings' && <SettingsPanel />}
          </section>
        </main>
      </div>
    </>
  );
}

function LockedBanner() {
  return (
    <div className="locked-banner">
      <LockKeyhole size={18} />
      <div>
        <strong>Backend not connected</strong>
        <p>Controls are shown for route coverage and layout parity. Wire Cloud Functions or secure admin APIs before enabling actions.</p>
      </div>
    </div>
  );
}

function AdminsPanel({ onLogAudit }: { onLogAudit: (entry: Omit<AuditEntry, 'time'>) => void }) {
  const [admins, setAdmins] = useState([
    { name: 'Dominic Esparrago', mail: 'super@css-vote - you', role: 'super', label: 'Super admin' },
    { name: 'J. Ocampo', mail: 'j.ocampo.scc@gmail.com', role: 'admin', label: 'Admin' },
    { name: 'M. Santos', mail: 'm.santos.scc@gmail.com', role: 'admin', label: 'Admin' },
    { name: 'L. Reyes', mail: 'l.reyes.scc@gmail.com', role: 'admin', label: 'Admin' },
  ]);
  const [confirm, setConfirm] = useState<{ action: 'revoke' | 'super'; index: number } | null>(null);
  const [reason, setReason] = useState('');

  const target = confirm ? admins[confirm.index] : null;
  const reasonReady = reason.trim().length >= MIN_REASON_LENGTH;

  function applyConfirm() {
    if (!confirm || !target || !reasonReady) return;
    if (confirm.action === 'revoke') {
      setAdmins((current) => current.filter((_, index) => index !== confirm.index));
    } else {
      setAdmins((current) => current.map((admin, index) => (
        index === confirm.index ? { ...admin, role: 'super', label: 'Super admin' } : admin
      )));
    }
    onLogAudit({
      actor: 'Dominic Esparrago',
      role: 'super',
      action: confirm.action === 'revoke' ? `revoked admin access - ${reason.trim()}` : `granted super admin - ${reason.trim()}`,
      target: target.mail,
    });
    setConfirm(null);
    setReason('');
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Access control</span>
          <h1>Admins</h1>
          <p>Grant or revoke who can run elections. Super admins can manage other admins.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" type="button">+ Invite admin</button>
        </div>
      </header>
      <LockedBanner />
      <div className="student-facts">
        {[
          { icon: Users, value: String(admins.length), label: 'Admins' },
          { icon: ShieldCheck, value: String(admins.filter((admin) => admin.role === 'super').length), label: 'Super admins' },
          { icon: CalendarClock, value: '1', label: 'Pending invite' },
        ].map(({ icon: Icon, value, label }) => (
          <article className="fact" key={label}>
            <span className="ic"><Icon size={20} /></span>
            <div><div className="num grad">{value}</div><div className="lbl">{label}</div></div>
          </article>
        ))}
      </div>
      <div className="superadmin-list" aria-label="Admin accounts">
        <div className="block-label">
          <h2>Admin accounts</h2>
          <small>{admins.length} total</small>
        </div>
        {admins.map((admin, index) => (
          <div className="superadmin-row admin-account-row" key={admin.mail}>
            <span className="student-avatar">{admin.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{admin.name}</strong>
              <p>{admin.mail}</p>
            </div>
            <div className="superadmin-actions">
              <span className={`tag ${admin.role === 'super' ? 'super' : ''}`}>{admin.label}</span>
              {admin.role !== 'super' && (
                <>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm({ action: 'super', index })}>Make super</button>
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirm({ action: 'revoke', index })}>Revoke</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {confirm && target && (
        <div className="confirm-overlay" role="presentation">
          <div className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className={`confirm-icon ${confirm.action === 'revoke' ? 'danger' : 'amber'}`}>
              {confirm.action === 'revoke' ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}
            </div>
            <h2 id="confirm-title">{confirm.action === 'revoke' ? 'Revoke admin access?' : 'Grant super admin?'}</h2>
            <p>
              {confirm.action === 'revoke'
                ? `${target.name} will no longer be able to manage candidates, voters, results, or the election lifecycle.`
                : `This upgrades ${target.name} to super admin.`}
            </p>
            <div className="confirm-consequence">
              This is a privileged action. In production it should be written to the audit log with a reason.
            </div>
            <label className="confirm-field">
              <span>Reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required before enabling backend action" />
              <small className="confirm-reason-hint">
                {reasonReady ? 'Reason will be written to the audit log.' : `At least ${MIN_REASON_LENGTH} characters (${reason.trim().length}/${MIN_REASON_LENGTH}).`}
              </small>
            </label>
            <div className="confirm-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setConfirm(null); setReason(''); }}>Cancel</button>
              <button
                className={confirm.action === 'revoke' ? 'btn btn-danger' : 'btn btn-amber'}
                type="button"
                disabled={!reasonReady}
                onClick={applyConfirm}
              >
                {confirm.action === 'revoke' ? 'Revoke access' : 'Make super admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ElectionsPanel() {
  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Cycles</span>
          <h1>Elections</h1>
          <p>Create, activate, and archive election cycles from a secured backend.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" type="button" disabled>New election</button>
        </div>
      </header>
      <LockedBanner />
      <div className="superadmin-list">
        {[
          ['CSS Department Election 2026', 'active', '20 positions - 248 registered voters'],
          ['CSS Department Election 2025', 'archived', 'Published results - read-only'],
          ['Practice Election', 'draft', 'Setup incomplete'],
        ].map(([title, status, meta]) => (
          <div className="superadmin-row" key={title}>
            <Vote size={20} />
            <div>
              <strong>{title}</strong>
              <p>{meta}</p>
            </div>
            <div className="superadmin-actions">
              <span className={`tag ${status}`}>{status}</span>
              <a className={status === 'draft' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} href="/admin">
                {status === 'active' ? 'Manage' : status === 'draft' ? 'Activate' : 'View'}
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Traceability</span>
          <h1>Audit log</h1>
          <p>Privileged actions should be recorded with actor, role, and timestamp.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost btn-sm" type="button" disabled>Export log</button>
        </div>
      </header>
      <LockedBanner />
      {entries.length === 0 ? (
        <div className="state-block">
          <strong>No audit entries yet</strong>
          <small>Privileged actions will appear here as they happen.</small>
        </div>
      ) : (
        <div className="hist">
          {entries.map((entry) => {
            const key = `${entry.time}-${entry.target}-${entry.action}`;
            const open = openKeys.has(key);
            return (
              <div className={`hpoll${open ? ' open' : ''}`} key={key}>
                <button
                  className="hpoll-head"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`audit-detail-${key}`}
                  onClick={() => toggle(key)}
                >
                  <span className="hicon"><FileText size={18} /></span>
                  <span className="hmeta">
                    <b>{entry.action}</b>
                    <small>{entry.time} · {entry.actor}</small>
                  </span>
                  <span className={`htag${entry.role === 'super' ? ' accent' : ''}`}>{entry.role}</span>
                  <ChevronDown className="chev" size={18} aria-hidden="true" />
                </button>
                <div className="hvotes" id={`audit-detail-${key}`}>
                  <div className="hv-inner">
                    <div className="hvote">
                      <span>Target</span>
                      <b>{entry.target}</b>
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

function SettingsPanel() {
  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h1>Settings</h1>
          <p>System-wide options for institutional registration and voting policy.</p>
        </div>
      </header>
      <LockedBanner />
      <div className="settings-grid">
        {[
          ['Require .scc email', 'Only institutional emails may register.'],
          ['Allow one-time voters', 'Enable single-use committee-issued access.'],
          ['Hide live tallies', 'Keep counts private until the committee publishes results.'],
          ['Maintenance mode', 'Take the platform offline for students.'],
        ].map(([title, body]) => (
          <div className="setting-row" key={title}>
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
            <button className={`toggle${title === 'Maintenance mode' ? '' : ' on'}`} type="button" disabled aria-label={`${title} locked`} />
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
