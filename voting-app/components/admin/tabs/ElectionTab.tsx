'use client';

import { useState } from 'react';
import { publishElection, setElectionStatus } from '@/lib/admin/adminData';
import { buildTallies } from '@/lib/admin/adminCore';
import type { Election, Vote } from '@/lib/types';

interface Props {
  election: Election | null;
  votes: Vote[];
  actorUid: string;
}

export default function ElectionTab({ election, votes, actorUid }: Props) {
  const [busy, setBusy] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  async function handleStatus(status: string) {
    setBusy(status);
    try {
      await setElectionStatus(status, actorUid);
    } finally {
      setBusy('');
    }
  }

  async function handlePublish() {
    if (election?.status !== 'closed') {
      setStatusMsg('Close the election before publishing results.');
      return;
    }
    setBusy('publish');
    try {
      await publishElection({ actorUid });
      setStatusMsg('Results published from recomputed vote records.');
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  const canPublish = election?.status === 'closed';
  const tallyPreview = JSON.stringify(buildTallies(election?.id ?? '', votes), null, 2);

  return (
    <section className="admin-section is-active" data-admin-panel="election">
      <div className="admin-grid">
        <article className="admin-card">
          <h2>Lifecycle controls</h2>
          <p id="election-status-line" className="lede">Current status: {election?.status ?? 'loading'}</p>
          {statusMsg && <p className="form-message" role="status">{statusMsg}</p>}
          <div className="lifecycle-actions">
            <button className="btn btn-ghost" type="button" disabled={busy === 'draft'} onClick={() => handleStatus('draft')}>
              {busy === 'draft' ? 'Updating...' : 'Reopen draft'}
            </button>
            <button className="btn btn-primary" type="button" disabled={busy === 'open'} onClick={() => handleStatus('open')}>
              {busy === 'open' ? 'Updating...' : 'Open voting'}
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy === 'closed'} onClick={() => handleStatus('closed')}>
              {busy === 'closed' ? 'Updating...' : 'Close voting'}
            </button>
            <button
              className="btn btn-primary"
              id="publish-button"
              type="button"
              disabled={!canPublish || busy === 'publish'}
              title={canPublish ? '' : 'Close the election before publishing results.'}
              onClick={handlePublish}
            >
              {busy === 'publish' ? 'Publishing...' : 'Publish results'}
            </button>
          </div>
          <p className="table-note">
            Reopen is intentionally exposed for correction windows; every transition is written to audit.
          </p>
        </article>
        <article className="admin-card">
          <h2>Published tally preview</h2>
          <pre id="tally-preview" className="json-preview">{tallyPreview}</pre>
        </article>
      </div>
    </section>
  );
}
