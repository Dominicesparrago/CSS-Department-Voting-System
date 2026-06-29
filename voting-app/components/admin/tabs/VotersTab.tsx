'use client';

import { useState } from 'react';
import { setVoterEligibility } from '@/lib/admin/adminData';
import { ELECTION_ID } from '@/lib/constants';
import type { Voter } from '@/lib/types';

interface Props {
  voters: Voter[];
  actorUid: string;
  onRefresh: () => Promise<void>;
}

function hasVoted(voter: Voter): boolean {
  return voter.hasVoted?.[ELECTION_ID] === true;
}

export default function VotersTab({ voters, actorUid, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  const filtered = voters.filter((v) => {
    const hay = `${v.fullName} ${v.email} ${v.studentNo} ${v.section}`.toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  async function toggleEligibility(voter: Voter) {
    setBusy(voter.id);
    try {
      await setVoterEligibility(voter.id, !voter.eligible, actorUid);
      await onRefresh();
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="admin-section is-active" data-admin-panel="voters">
      <article className="admin-card">
        <div className="section-title-row">
          <h2>Voter management</h2>
          <input
            id="voter-search"
            className="search-input"
            autoComplete="off"
            placeholder="Search voters"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Student ID</th>
                <th>Year</th>
                <th>Eligible</th>
                <th>Has voted</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="voter-table">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="state-block">
                      <strong>{voters.length ? 'No matching voters' : 'No registered voters yet'}</strong>
                      <small>{voters.length ? 'Try a different search term.' : 'Voters appear here after they self-register on the web app.'}</small>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((voter) => (
                  <tr key={voter.id}>
                    <td>{voter.fullName}<br /><small>{voter.email}</small></td>
                    <td>{voter.studentNo}</td>
                    <td>{voter.yearLevel}</td>
                    <td>{voter.eligible ? 'Yes' : 'No'}</td>
                    <td>{hasVoted(voter) ? 'Yes' : 'No'}</td>
                    <td>
                      <button
                        className="btn btn-ghost table-button"
                        type="button"
                        disabled={busy === voter.id}
                        onClick={() => toggleEligibility(voter)}
                      >
                        {busy === voter.id ? 'Working...' : voter.eligible ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
