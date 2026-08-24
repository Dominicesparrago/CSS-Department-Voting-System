'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Database,
  Download,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import { downloadFile } from '@/components/admin/console/shared';
import { backupsToCsv } from '@/lib/admin/exportCenter';
import { formatTimestamp } from '@/lib/format';
import { getFunctionsErrorMessage } from '@/lib/firebase/functionsError';
import {
  createBackup,
  deleteBackup,
  estimateReset,
  resetElectionData,
  restoreBackup,
  watchBackups,
  type ResetResult,
} from '@/lib/superadmin/database';
import { ELECTION_ID } from '@/lib/constants';
import type { BackupRecord, ResetScope } from '@/lib/types';

const RESET_SCOPES: Array<{ scope: ResetScope; label: string; body: string }> = [
  { scope: 'candidates', label: 'Candidates', body: 'Delete all candidates for this election (positions and roster untouched).' },
  { scope: 'voters', label: 'Voter status', body: 'Clear participation locks so eligible voters can cast a fresh ballot.' },
  { scope: 'ballots', label: 'Ballots & results', body: 'Delete ballots, the tally, and participation locks — a full re-vote.' },
  { scope: 'full', label: 'Full election data', body: 'Candidates, ballots, tally, and locks — everything except positions/roster/accounts.' },
];

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** What a scope will actually delete, from the server estimate. */
function scopeImpact(scope: ResetScope, estimate: { candidates: number; ballots: number; votersLocked: number }): string {
  if (scope === 'candidates') return `${estimate.candidates} candidate${estimate.candidates === 1 ? '' : 's'}`;
  if (scope === 'voters') return `${estimate.votersLocked} voter lock${estimate.votersLocked === 1 ? '' : 's'}`;
  if (scope === 'ballots') return `${estimate.ballots} ballots, the tally, and ${estimate.votersLocked} voter locks`;
  return `${estimate.candidates} candidates, ${estimate.ballots} ballots, the tally, and ${estimate.votersLocked} voter locks`;
}

export default function BackupCenter({ electionId }: { electionId?: string }) {
  const electionIdResolved = electionId ?? ELECTION_ID;
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  // Reset Center state
  const [scope, setScope] = useState<ResetScope>('candidates');
  const [estimate, setEstimate] = useState<{ candidates: number; ballots: number; tallies: number; votersLocked: number } | null>(null);
  const [backupId, setBackupId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [armed, setArmed] = useState(false);
  const [force, setForce] = useState(false);

  // Delete arm/confirm: first tap arms, second tap deletes; auto-disarms after 5s.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const disarmTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (disarmTimer.current) window.clearTimeout(disarmTimer.current);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = watchBackups(
      (records) => setBackups(records),
      (error) => setLoadError(error.message),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loadError) setNotice({ text: loadError, error: true });
  }, [loadError]);

  async function planReset() {
    setBusy('plan');
    setNotice(null);
    try {
      const result = await estimateReset(electionIdResolved);
      setEstimate({ candidates: result.candidates, ballots: result.ballots, tallies: result.tallies, votersLocked: result.votersLocked });
      setBackupId('');
      setArmed(false);
      setForce(false);
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  async function makeBackup(type: 'manual' | 'pre-reset' = 'manual') {
    setBusy(type);
    setNotice(null);
    try {
      const result = await createBackup({ electionId: electionIdResolved, type });
      if (type === 'pre-reset') {
        setBackupId(result.backupId);
        setArmed(false);
        setForce(false);
      }
      setNotice({ text: `Backup created (${result.sizeBytes} bytes).` });
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  function requestRestore(record: BackupRecord) {
    setBusy(`restore-${record.id}`);
    setNotice(null);
    void (async () => {
      try {
        const result = await restoreBackup({ backupId: record.id, overwrite: false });
        setNotice({ text: `Backup restored: ${result.counts.candidates ?? 0} candidates, ${result.counts.ballots ?? 0} ballots.` });
      } catch (error) {
        setNotice({ text: getFunctionsErrorMessage(error), error: true });
      } finally {
        setBusy('');
      }
    })();
  }

  function armDelete(record: BackupRecord) {
    if (armedDeleteId === record.id) {
      setArmedDeleteId(null);
      requestDelete(record);
      return;
    }
    setArmedDeleteId(record.id);
    if (disarmTimer.current) window.clearTimeout(disarmTimer.current);
    disarmTimer.current = window.setTimeout(() => setArmedDeleteId(null), 5000);
  }

  function requestDelete(record: BackupRecord) {
    if (disarmTimer.current) {
      window.clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setBusy(`delete-${record.id}`);
    setNotice(null);
    void (async () => {
      try {
        await deleteBackup(record.id);
        setNotice({ text: 'Backup deleted.' });
      } catch (error) {
        setNotice({ text: getFunctionsErrorMessage(error), error: true });
      } finally {
        setBusy('');
      }
    })();
  }

  async function executeReset() {
    if (!backupId || confirming) return;
    setConfirming(true);
    setNotice(null);
    try {
      const result: ResetResult = await resetElectionData({ electionId: electionIdResolved, scope, backupId, force: force ? true : undefined });
      const deleted = result.deleted;
      const parts: string[] = [];
      if (deleted.candidates > 0) parts.push(`${deleted.candidates} candidates`);
      if (deleted.ballots > 0) parts.push(`${deleted.ballots} ballots`);
      if (deleted.tallies > 0) parts.push('1 tally');
      if (deleted.votersLocked > 0) parts.push(`${deleted.votersLocked} voter locks`);
      setNotice({ text: `Reset complete — ${parts.join(', ') || 'nothing was deleted'}. Backup ${shortId(backupId)} is kept as evidence.` });
      setEstimate(null);
      setBackupId('');
      setArmed(false);
      setForce(false);
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setConfirming(false);
    }
  }

  const selectedBackup = backups.find((b) => b.id === backupId);
  const scopeLabel = RESET_SCOPES.find((s) => s.scope === scope)?.label ?? scope;
  const inconsistentLocks = estimate !== null && scope !== 'ballots' && scope !== 'full' && estimate.ballots > 0;

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Safety &amp; recovery</span>
          <h1>Backups &amp; reset</h1>
          <p>Snapshot the election before any destructive change. A reset is refused unless a fresh backup exists — and every action is audit-logged.</p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={backups.length === 0}
            onClick={() => downloadFile(`css-backups-${ELECTION_ID}.csv`, backupsToCsv(backups), 'text/csv;charset=utf-8')}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            Backups CSV
          </button>
        </div>
      </header>
      <NoticeLine notice={notice} />

      <div className="block-label">
        <h2>Create a backup</h2>
        <small>election snapshot — candidates, anonymous ballots, tally, participation locks</small>
      </div>
      <div className="two-col backup-actions">
        <div className="state-block">
          <strong>Manual backup</strong>
          <small>Take a point-in-time snapshot now. Safe to do anytime — voters keep voting.</small>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy === 'manual'} onClick={() => void makeBackup('manual')}>
              <HardDrive size={14} style={{ marginRight: 6 }} />
              {busy === 'manual' ? 'Creating…' : 'Create backup'}
            </button>
          </div>
        </div>
        <div className="state-block">
          <strong>Pre-reset backup</strong>
          <small>Snapshot immediately before a destructive reset. Required before anything is deleted.</small>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-amber btn-sm" type="button" disabled={busy === 'pre-reset'} onClick={() => void makeBackup('pre-reset')}>
              <ShieldCheck size={14} style={{ marginRight: 6 }} />
              {busy === 'pre-reset' ? 'Creating…' : 'Create pre-reset backup'}
            </button>
          </div>
        </div>
      </div>

      {backups.length === 0 ? (
        <div className="state-block">
          <strong>No backups yet</strong>
          <small>Backups are the safety net for every reset. Create one before destructive changes.</small>
        </div>
      ) : (
        <>
          <div className="block-label">
            <h2>Backup history</h2>
            <small>{backups.length} stored in Cloud Storage</small>
          </div>
          <div className="superadmin-list" aria-label="Backup history">
            {backups.map((record) => (
              <div className="superadmin-row" key={record.id}>
                <span className="student-avatar"><ArchiveRestore size={18} /></span>
                <div>
                  <strong>{shortId(record.id)} <span className={`tag ${record.type === 'pre-reset' ? 'active' : ''}`}>{record.type}</span></strong>
                  <p>
                    {formatTimestamp(record.createdAt) || 'just now'} · {record.recordCounts?.candidates ?? 0} candidates · {record.recordCounts?.ballots ?? 0} ballots · {record.recordCounts?.participation ?? 0} locks
                    {' · '}{(record.sizeBytes / 1024).toFixed(1)} KB
                    {' · '}{record.checksum ? `${record.checksum.slice(0, 10)}…` : 'no checksum'}
                  </p>
                </div>
                <div className="superadmin-actions">
                  <span className="tag">{record.electionId === electionIdResolved ? 'this election' : record.electionId}</span>
                  <button className="btn btn-ghost btn-sm" type="button" disabled={busy === `restore-${record.id}`} onClick={() => requestRestore(record)}>
                    Restore
                  </button>
                  <button className="btn btn-danger btn-sm" type="button" disabled={busy === `delete-${record.id}`} onClick={() => armDelete(record)} title={armedDeleteId === record.id ? 'Click again to confirm permanent deletion' : 'Delete this backup'}>
                    <Trash2 size={14} style={{ marginRight: 6 }} />
                    {armedDeleteId === record.id ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="block-label">
        <h2>Reset Center</h2>
        <small>election-scoped destructive reset — backup first, always</small>
      </div>
      <div className="two-col reset-center">
        <div>
          {RESET_SCOPES.map(({ scope: key, label, body }) => (
            <button
              key={key}
              className={`toggle-row${scope === key ? ' on' : ''}`}
              type="button"
              aria-pressed={scope === key}
              onClick={() => { setScope(key); setEstimate(null); setBackupId(''); setArmed(false); setForce(false); }}
            >
              <div>
                <strong>{label}</strong>
                <small>{body}</small>
              </div>
            </button>
          ))}
        </div>
        <div>
          <div className="state-block">
            <strong>What will be cleared</strong>
            <small>Tap a scope above, then plan the reset to see live counts from the server.</small>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" type="button" disabled={busy === 'plan'} onClick={() => void planReset()}>
                <Database size={14} style={{ marginRight: 6 }} />
                {busy === 'plan' ? 'Planning…' : 'Plan reset'}
              </button>
            </div>
          </div>
          {estimate && (
            <div className="state-block" style={{ marginTop: 12 }}>
              <strong>Affected records</strong>
              <p style={{ margin: '8px 0 0' }}>
                {estimate.candidates} candidates · {estimate.ballots} ballots · {estimate.tallies > 0 ? '1 tally' : 'no tally'} · {estimate.votersLocked} voter locks
              </p>
            </div>
          )}
        </div>
      </div>

      {estimate && (
        <div className="state-block reset-confirm">
          <strong>Choose the safety backup</strong>
          <small>Select a backup created for this election — or create a pre-reset backup above. The reset is refused without one.</small>
          <div className="superadmin-list" style={{ marginTop: 12 }}>
            {backups.filter((b) => b.electionId === electionIdResolved).length === 0 ? (
              <div className="superadmin-row">
                <div><strong>No backups for this election</strong></div>
              </div>
            ) : (
              backups.filter((b) => b.electionId === electionIdResolved).map((record) => (
                <div className="superadmin-row" key={record.id}>
                  <input
                    type="radio"
                    name="backup-select"
                    id={`backup-${record.id}`}
                    checked={backupId === record.id}
                    onChange={() => { setBackupId(record.id); setArmed(false); }}
                  />
                  <label htmlFor={`backup-${record.id}`} style={{ flex: 1 }}>
                    <strong>{shortId(record.id)}</strong>
                    <small> {formatTimestamp(record.createdAt) || 'just now'} · {record.recordCounts?.ballots ?? 0} ballots</small>
                  </label>
                </div>
              ))
            )}
          </div>
          {inconsistentLocks && (
            <>
              <p className="form-message is-error" role="alert">
                <TriangleAlert size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                This election already has {estimate.ballots} ballots. Clearing voter status alone would make turnout inconsistent — use the ballots/full reset, or force.
              </p>
              <label className="check-row">
                <input type="checkbox" checked={force} onChange={(event) => { setForce(event.target.checked); setArmed(false); }} />
                Force anyway — clears {estimate.votersLocked} locks while {estimate.ballots} ballots remain (audited)
              </label>
            </>
          )}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              disabled={!selectedBackup || confirming || (armed && inconsistentLocks && !force)}
              onClick={() => { if (armed) void executeReset(); else setArmed(true); }}
            >
              <RotateCcw size={14} style={{ marginRight: 6 }} />
              {confirming ? 'Resetting…' : armed ? `Confirm & reset ${scopeLabel}` : `Reset ${scopeLabel}`}
            </button>
            <span className="tag" style={{ marginLeft: 8 }}>
              safety backup: {selectedBackup ? shortId(selectedBackup.id) : backupId ? `${shortId(backupId)} (syncing)` : 'none'}
            </span>
            {armed && !confirming && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setArmed(false)}>Cancel</button>
            )}
          </div>
          {armed && estimate && (
            <small style={{ display: 'block', marginTop: 10, color: 'var(--muted)' }}>
              This will delete {scopeImpact(scope, estimate)}. Backup {shortId(backupId)} is kept as evidence.
            </small>
          )}
        </div>
      )}
    </>
  );
}