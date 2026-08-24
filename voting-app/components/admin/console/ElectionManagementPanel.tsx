'use client';

import { getFunctionsErrorMessage } from '@/lib/firebase/functionsError';
import { useState } from 'react';
import { Archive, CheckCircle2, LockKeyhole, Plus, RotateCcw, Stethoscope, UnlockKeyhole, Vote, TriangleAlert } from 'lucide-react';
import NoticeLine, { type Notice } from '@/components/admin/console/NoticeLine';
import { formatTimestamp } from '@/lib/format';
import {
  archiveElection,
  createElection,
  lockElection,
  restoreElection,
  unlockElection,
  updateElection,
  resetAllElectionData,
} from '@/lib/superadmin/elections';
import { verifyResults, finalizeElection } from '@/lib/superadmin/results';
import { ELECTION_ID } from '@/lib/constants';
import type { Election, Position } from '@/lib/types';

const STATUS_LABELS: Record<Election['status'], string> = {
  draft: 'draft',
  open: 'active',
  closed: 'closed',
  published: 'published',
  finalized: 'finalized',
  archived: 'archived',
};

export default function ElectionManagementPanel({ elections, positions }: { elections: Election[]; positions: Position[] }) {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [verifyResult, setVerifyResult] = useState<string>('');
  const [resetElectionId, setResetElectionId] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set(positions.map((p) => p.id)));

  const ordered = [...elections].sort((a, b) => (a.id === ELECTION_ID ? -1 : b.id === ELECTION_ID ? 1 : a.id.localeCompare(b.id)));

  function run(actionKey: string, fn: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(actionKey);
    setNotice(null);
    setVerifyResult('');
    void (async () => {
      try {
        await fn();
        setNotice({ text: success });
      } catch (error) {
        setNotice({ text: getFunctionsErrorMessage(error), error: true });
      } finally {
        setBusy('');
      }
    })();
  }

  async function create() {
    if (!title.trim() || busy) return;
    setBusy('create');
    setNotice(null);
    try {
      const result = await createElection({
        title: title.trim(),
        positions: [...selectedPositions],
      });
      setNotice({ text: `Election created (${result.id}).` });
      setShowCreate(false);
      setTitle('');
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  function togglePosition(id: string) {
    setSelectedPositions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function resetAllData(electionId: string) {
    if (busy || resetConfirmation !== 'DELETE ALL STUDENT AND CANDIDATE DATA') return;
    setBusy(`reset-all-${electionId}`);
    setNotice(null);
    try {
      const result = await resetAllElectionData({ electionId, confirmation: resetConfirmation });
      const deleted = result.deleted;
      setNotice({ text: `Reset complete — ${deleted.students} students, ${deleted.authUsers} auth accounts, ${deleted.candidates} candidates, and ${deleted.ballots} ballots deleted.` });
      setResetElectionId(null);
      setResetConfirmation('');
    } catch (error) {
      setNotice({ text: getFunctionsErrorMessage(error), error: true });
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <header className="head">
        <div>
          <span className="eyebrow">Cycles</span>
          <h1>Elections</h1>
          <p>Create and manage election cycles. Locking blocks ordinary admin edits and voting; finalization seals results after the verification checklist passes.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus size={14} style={{ marginRight: 6 }} />
            New election
          </button>
        </div>
      </header>
      <NoticeLine notice={notice} />
      {verifyResult && <div className="state-block"><strong>{verifyResult}</strong></div>}

      {showCreate && (
        <div className="state-block">
          <strong>Create a new election</strong>
          <label className="field" style={{ marginTop: 8 }}>
            <span>Title</span>
            <input value={title} placeholder="e.g. CSS Student Council 2027" onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="block-label" style={{ marginTop: 8 }}>
            <h2>Ballot positions</h2>
            <small>{selectedPositions.size}/{positions.length} selected</small>
          </div>
          <div className="superadmin-list">
            {[...positions].sort((a, b) => a.order - b.order).map((position) => (
              <div className="superadmin-row" key={position.id}>
                <input
                  type="checkbox"
                  id={`pos-${position.id}`}
                  checked={selectedPositions.has(position.id)}
                  onChange={() => togglePosition(position.id)}
                />
                <label htmlFor={`pos-${position.id}`} style={{ flex: 1 }}>
                  <strong>{position.name}</strong>
                  <small> {position.id}</small>
                </label>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" type="button" disabled={!title.trim() || busy === 'create'} onClick={() => void create()}>
              {busy === 'create' ? 'Creating…' : 'Create election'}
            </button>
          </div>
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="state-block">
          <strong>No elections found</strong>
          <small>The current election document is created during deployment seeding.</small>
        </div>
      ) : (
        <div className="superadmin-list">
          {ordered.map((election) => {
            const isCurrent = election.id === ELECTION_ID;
            const canLock = !['finalized', 'archived'].includes(election.status);
            const canFinalize = ['closed', 'published'].includes(election.status);
            const canArchive = ['closed', 'published', 'finalized'].includes(election.status);
            return (
              <div className="superadmin-row" key={election.id}>
                <Vote size={20} />
                <div>
                  <strong>{election.title || election.id}</strong>
                  <p>
                    {election.id}{isCurrent ? ' · current election' : ''}
                    {election.locked ? ' · locked' : ''}
                    {election.finalizedAt ? ` · finalized ${formatTimestamp(election.finalizedAt) || ''}` : ''}
                    {election.archivedAt ? ` · archived ${formatTimestamp(election.archivedAt) || ''}` : ''}
                    {` · ${(election.positions?.length ?? 0)} positions`}
                  </p>
                </div>
                <div className="superadmin-actions">
                  <span className={`tag ${election.status === 'open' ? 'active' : election.status}`}>{STATUS_LABELS[election.status] ?? election.status}</span>
                  {canLock && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy === `lock-${election.id}`}
                      onClick={() => run(`lock-${election.id}`, () => election.locked ? unlockElection(election.id) : lockElection(election.id), election.locked ? 'Election unlocked.' : 'Election locked.')}
                    >
                      {election.locked
                        ? <><UnlockKeyhole size={14} style={{ marginRight: 6 }} />Unlock</>
                        : <><LockKeyhole size={14} style={{ marginRight: 6 }} />Lock</>}
                    </button>
                  )}
                  {canFinalize && (
                    <>
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={busy === `verify-${election.id}`}
                        onClick={() => run(`verify-${election.id}`, async () => {
                          const result = await verifyResults(election.id);
                          setVerifyResult(result.ok ? 'Verification passed — ready to finalize.' : 'Verification found blocking issues.');
                        }, 'Verification complete.')}
                      >
                        <Stethoscope size={14} style={{ marginRight: 6 }} />
                        Verify
                      </button>
                      <button
                        className="btn btn-amber btn-sm"
                        type="button"
                        disabled={busy === `finalize-${election.id}`}
                        onClick={() => run(`finalize-${election.id}`, () => finalizeElection(election.id), 'Results finalized and sealed.')}
                      >
                        <CheckCircle2 size={14} style={{ marginRight: 6 }} />
                        Finalize
                      </button>
                    </>
                  )}
                  {canArchive && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy === `archive-${election.id}`}
                      onClick={() => run(`archive-${election.id}`, () => archiveElection(election.id), 'Election archived.')}
                    >
                      <Archive size={14} style={{ marginRight: 6 }} />
                    </button>
                  )}
                  {election.status === 'archived' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      disabled={busy === `restore-${election.id}`}
                      onClick={() => run(`restore-${election.id}`, () => restoreElection(election.id), 'Election restored to draft.')}
                    >
                      <RotateCcw size={14} style={{ marginRight: 6 }} />
                      Restore
                    </button>
                  )}
                  <a className="btn btn-primary btn-sm" href="/admin">Manage</a>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    disabled={Boolean(busy) || election.locked}
                    onClick={() => { setResetElectionId(election.id); setResetConfirmation(''); setNotice(null); }}
                    title={election.locked ? 'Unlock the election before resetting data' : 'Permanently delete all student and candidate data'}
                  >
                    <TriangleAlert size={14} style={{ marginRight: 6 }} />
                    Reset all data
                  </button>
                </div>
                {resetElectionId === election.id && (
                  <div className="state-block" style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                    <strong>Permanent destructive action</strong>
                    <p>This deletes every imported student, voter account record, student/email index, candidate, ballot, and tally for this election. The election definition, positions, admin accounts, and audit history remain.</p>
                    <label className="field">
                      <span>Type DELETE ALL STUDENT AND CANDIDATE DATA to continue</span>
                      <input value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} autoComplete="off" />
                    </label>
                    <div className="superadmin-actions" style={{ marginTop: 10 }}>
                      <button className="btn btn-danger btn-sm" type="button" disabled={resetConfirmation !== 'DELETE ALL STUDENT AND CANDIDATE DATA' || busy === `reset-all-${election.id}`} onClick={() => void resetAllData(election.id)}>
                        {busy === `reset-all-${election.id}` ? 'Deleting…' : 'Confirm permanent reset'}
                      </button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={busy === `reset-all-${election.id}`} onClick={() => { setResetElectionId(null); setResetConfirmation(''); }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
