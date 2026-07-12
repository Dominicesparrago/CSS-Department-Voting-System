'use client';

import { useMemo, useState } from 'react';
import { votersToCsv } from '@/lib/admin/adminCore';
import { ELECTION_ID } from '@/lib/constants';
import { yearLabel } from '@/lib/format';
import type { Voter } from '@/lib/types';
import { downloadFile, hasVoted } from './shared';

const PAGE_SIZE = 50;
const PAGE_STEP = 100;

type VoterFilter = 'all' | 'voted' | 'pending';

interface VotersPanelProps {
  active: boolean;
  voters: Voter[];
}

export default function VotersPanel({ active, voters }: VotersPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<VoterFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const votedCount = voters.filter(hasVoted).length;

  const filteredVoters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return voters.filter((voter) => {
      if (filter === 'voted' && !hasVoted(voter)) return false;
      if (filter === 'pending' && hasVoted(voter)) return false;
      return `${voter.fullName} ${voter.email} ${voter.studentNo ?? ''} ${voter.section}`.toLowerCase().includes(needle);
    });
  }, [search, voters, filter]);
  const visibleVoters = filteredVoters.slice(0, limit);

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="voters">
      <div className="head">
        <div><span className="eyebrow">Registry</span><h1>Voters</h1><p>{voters.length} registered · {votedCount} voted.</p></div>
        <div className="head-actions">
          <input className="search" aria-label="Search voters by name or ID" placeholder="Search name or ID…" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE); }} />
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            disabled={filteredVoters.length === 0}
            onClick={() => downloadFile(`css-voters-${filter}-${ELECTION_ID}.csv`, votersToCsv(filteredVoters, ELECTION_ID), 'text/csv;charset=utf-8')}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="pos-switch" role="group" aria-label="Filter voters by status">
        {([['all', 'All'], ['voted', 'Voted'], ['pending', 'Not yet voted']] as const).map(([key, label]) => (
          <button key={key} className={filter === key ? 'on' : ''} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(PAGE_SIZE); }}>
            {label}
          </button>
        ))}
      </div>
      <div className="twrap"><table>
        <thead><tr><th scope="col">Student</th><th scope="col">ID</th><th scope="col">Year</th><th scope="col">Section</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {filteredVoters.length === 0 ? <tr><td colSpan={5}><div className="state-block"><strong>No voters found</strong><small>{voters.length ? 'Try another search or filter.' : 'Registered voters will appear here.'}</small></div></td></tr> : visibleVoters.map((voter) => (
            <tr key={voter.id}><td>{voter.fullName}</td><td>{voter.studentNo || '—'}</td><td>{yearLabel(voter.yearLevel)}</td><td>{voter.section}</td><td>{hasVoted(voter) ? <span className="tag-win">Voted</span> : <small>Not yet</small>}</td></tr>
          ))}
        </tbody>
      </table></div>
      {filteredVoters.length > limit && (
        <div className="tfoot-row">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setLimit((current) => current + PAGE_STEP)}>
            Show more ({filteredVoters.length - limit} remaining)
          </button>
        </div>
      )}
    </section>
  );
}
