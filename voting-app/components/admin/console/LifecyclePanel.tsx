'use client';

import { useState } from 'react';
import { publishElection, setElectionStatus, setRegistrationOpen } from '@/lib/admin/adminData';
import { formatTimestamp } from '@/lib/format';
import type { AuditEntry, Election } from '@/lib/types';
import NoticeLine, { type Notice } from './NoticeLine';
import type { ConfirmState } from './ConfirmDialog';

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'candidate.create': 'Added candidate',
  'candidate.update': 'Updated candidate',
  'candidate.delete': 'Removed candidate',
  'candidate.active.set': 'Changed candidate visibility',
  'voter.eligible.set': 'Changed voter eligibility',
  'election.status.set': 'Changed voting status',
  'election.registration.set': 'Toggled registration',
  'election.publish': 'Published results',
};

function auditDetail(entry: AuditEntry): string {
  const details = entry.details ?? {};
  if (typeof details.status === 'string') return `→ ${details.status}`;
  if (typeof details.registrationOpen === 'boolean') return details.registrationOpen ? '→ open' : '→ closed';
  if (typeof details.active === 'boolean') return details.active ? '→ shown' : '→ hidden';
  if (typeof details.eligible === 'boolean') return details.eligible ? '→ eligible' : '→ ineligible';
  if (typeof details.turnout === 'number') return `turnout ${details.turnout}`;
  return '';
}

interface LifecyclePanelProps {
  active: boolean;
  actorUid: string;
  election: Election | null;
  auditEntries: AuditEntry[];
  onRequestConfirm: (state: ConfirmState) => void;
}

export default function LifecyclePanel({ active, actorUid, election, auditEntries, onRequestConfirm }: LifecyclePanelProps) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<Notice>(null);

  const registrationOpen = election?.registrationOpen ?? true;
  const votingOpen = election?.status === 'open';
  const resultsPublished = election?.status === 'published';
  const canPublish = election?.status === 'closed';

  async function runLifecycleAction(key: string, action: () => Promise<unknown>, successText: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ text: successText });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      setBusy('');
    }
  }

  const updateRegistration = (open: boolean) => runLifecycleAction(
    'registration',
    () => setRegistrationOpen(open, actorUid),
    open ? 'Registration is now open.' : 'Registration is now closed.',
  );

  const updateVoting = (status: 'open' | 'closed') => runLifecycleAction(
    status,
    () => setElectionStatus(status, actorUid),
    status === 'open' ? 'Voting is now open.' : 'Voting is now closed.',
  );

  const publishResults = () => runLifecycleAction(
    'publish',
    () => publishElection({ actorUid }),
    'Results were recomputed and published.',
  );

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="lifecycle">
      <div className="head"><div><span className="eyebrow">Phases</span><h1>Lifecycle</h1><p>Control registration, voting, and result publication. Actions are logged.</p></div></div>
      <NoticeLine notice={message} />
      <div className="life">
        <div className="lifebox"><span className={`state${registrationOpen ? '' : ' off'}`}><span className="d" />{registrationOpen ? 'Open' : 'Closed'}</span><h3>Registration</h3><p>Students can create accounts and verify their details.</p><button className="btn btn-ghost btn-sm" type="button" disabled={busy === 'registration'} onClick={() => updateRegistration(!registrationOpen)}>{busy === 'registration' ? 'Updating…' : registrationOpen ? 'Close registration' : 'Open registration'}</button></div>
        <div className="lifebox"><span className={`state${votingOpen ? '' : ' off'}`}><span className="d" />{votingOpen ? 'Open' : election?.status === 'draft' ? 'Not started' : 'Closed'}</span><h3>Voting</h3><p>Verified students can submit their ballots.</p>{votingOpen ? <button className="btn btn-danger btn-sm" type="button" disabled={busy === 'closed'} onClick={() => onRequestConfirm({ title: 'Close the polls?', body: 'Students will immediately be unable to submit ballots. You can reopen voting later if needed.', confirmLabel: 'Close polls', danger: true, action: () => void updateVoting('closed') })}>{busy === 'closed' ? 'Updating…' : 'Close polls'}</button> : <button className="btn btn-primary btn-sm" type="button" disabled={busy === 'open' || resultsPublished} onClick={() => updateVoting('open')}>{busy === 'open' ? 'Updating…' : 'Open voting'}</button>}</div>
        <div className="lifebox"><span className={`state${resultsPublished ? '' : ' off'}`}><span className="d" />{resultsPublished ? 'Published' : 'Hidden'}</span><h3>Results</h3><p>Publish official tallies to students after polls close.</p><button className="btn btn-primary btn-sm" type="button" disabled={!canPublish || busy === 'publish'} onClick={() => onRequestConfirm({ title: 'Publish official results?', body: 'Tallies will be recomputed from the immutable vote records and become visible to all students.', confirmLabel: 'Publish results', action: () => void publishResults() })}>{busy === 'publish' ? 'Publishing…' : 'Publish results'}</button></div>
      </div>

      <div className="ov-block">
        <div className="block-label"><h2>Recent admin activity</h2><small>immutable audit trail · latest {auditEntries.length}</small></div>
        {auditEntries.length === 0 ? (
          <div className="state-block">
            <strong>No admin activity yet</strong>
            <small>Lifecycle changes, candidate edits, and publishes are recorded here automatically.</small>
          </div>
        ) : (
          <ul className="audit-list">
            {auditEntries.map((entry) => (
              <li key={entry.id}>
                <span className="al-main">
                  <b>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</b>
                  {auditDetail(entry) && <em className="al-detail">{auditDetail(entry)}</em>}
                  <span className="tgt">{entry.target}</span>
                </span>
                <small>{formatTimestamp(entry.ts) || 'pending…'} · {entry.actorUid.slice(0, 8)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
