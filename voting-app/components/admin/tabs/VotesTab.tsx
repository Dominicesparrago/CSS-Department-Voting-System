'use client';

import { aggregateVotes, formatTimestamp, votesToCsv } from '@/lib/admin/adminCore';
import { ELECTION_ID } from '@/lib/constants';
import type { Candidate, Position, Vote, Voter } from '@/lib/types';

interface Props {
  votes: Vote[];
  candidates: Candidate[];
  positions: Position[];
  voters: Voter[];
}

export default function VotesTab({ votes, candidates, positions, voters }: Props) {
  const aggregate = aggregateVotes({ votes, candidates, positions, voters });

  function handleExport() {
    const csv = votesToCsv({ votes, candidates, positions });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `css-votes-${ELECTION_ID}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const displayVotes = votes.slice(-250).reverse();

  return (
    <section className="admin-section is-active" data-admin-panel="votes">
      <article className="admin-card">
        <div className="section-title-row">
          <h2>Vote records</h2>
          <button className="btn btn-ghost" id="export-votes-button" type="button" onClick={handleExport}>
            Export CSV
          </button>
        </div>
        <p className="table-note">Admin-only audit view. Exports include vote document fields and remain restricted.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vote ID</th>
                <th>Position</th>
                <th>Candidate</th>
                <th>Year</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody id="vote-table">
              {displayVotes.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="state-block">
                      <strong>No votes recorded yet</strong>
                      <small>Vote records appear here in real time once voting opens.</small>
                    </div>
                  </td>
                </tr>
              ) : (
                displayVotes.map((vote) => (
                  <tr key={vote.id}>
                    <td><small>{vote.id}</small></td>
                    <td>{aggregate.positionsById[vote.positionId]?.name ?? vote.positionId}</td>
                    <td>{aggregate.candidatesById[vote.candidateId]?.name ?? vote.candidateId}</td>
                    <td>{vote.yearLevel}</td>
                    <td>{formatTimestamp(vote.createdAt)}</td>
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
