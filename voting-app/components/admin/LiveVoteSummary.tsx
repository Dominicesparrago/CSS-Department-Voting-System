'use client';

import { useEffect, useMemo, useState } from 'react';
import CountUp from '@/components/CountUp';
import CustomSelect, { type CustomSelectOption } from '@/components/ui/CustomSelect';
import { currentWinner, positionVoteRows, type Aggregate } from '@/lib/admin/adminCore';
import { percent, yearLabel } from '@/lib/format';
import { initials } from '@/lib/initials';
import type { Candidate, Position } from '@/lib/types';

interface LiveVoteSummaryProps {
  aggregate: Aggregate;
  candidates: Candidate[];
  positions: Position[];
  positionOptions: CustomSelectOption[];
}

const COLORS = ['#22b8a0', '#8cb4ff', '#f4b860', '#f58d9e', '#7fd3ff', '#c7a3ff', '#9ad36f', '#ffb26b'];

function chartGradient(rows: { votes: number }[]): string {
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  if (total <= 0) return 'linear-gradient(145deg, rgba(34,184,160,.16), rgba(255,255,255,.06))';

  let cursor = 0;
  const segments = rows.map((row, index) => {
    const share = (row.votes / total) * 100;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return `${COLORS[index % COLORS.length]} ${start}% ${end}%`;
  });

  return `conic-gradient(${segments.join(', ')})`;
}

export default function LiveVoteSummary({ aggregate, candidates, positions, positionOptions }: LiveVoteSummaryProps) {
  const [positionId, setPositionId] = useState('');

  useEffect(() => {
    if (positions.length > 0) setPositionId((current) => current || positions[0].id);
  }, [positions]);

  const overviewPosition = positions.find((position) => position.id === positionId);
  const { rows, total } = useMemo(
    () => positionVoteRows(candidates, aggregate, positionId),
    [aggregate, candidates, positionId],
  );
  const winner = useMemo(() => currentWinner(rows), [rows]);
  const ringStyle = useMemo(() => ({ background: chartGradient(rows) }), [rows]);
  const totalVotes = total;
  const positionShare = percent(total, aggregate.turnout.total || total);

  return (
    <div className="ov-block live-vote-summary">
      <div className="block-label">
        <h2>Live voting</h2>
        <small>{overviewPosition?.name ?? 'Select a position to inspect live results'}</small>
      </div>

      <div className="pos-select">
        <CustomSelect
          label="Position"
          value={positionId}
          options={positionOptions}
          placeholder="Select position"
          disabled={positionOptions.length === 0}
          onChange={setPositionId}
        />
      </div>

      <div className="turnout-grid">
        <div className="ring-wrap">
          <div className="donut" style={ringStyle}>
            <div className="hole">
              <div>
                <b className="grad"><CountUp value={totalVotes} /></b>
                <small>Votes in race</small>
              </div>
            </div>
          </div>
          <p className="ring-cap">
            {totalVotes > 0
              ? `Current leader: ${winner.label}`
              : 'Votes appear here as they are submitted.'}
          </p>
        </div>

        <div className="tby" aria-label="Vote distribution by candidate">
          <div className="tby-row" style={{ marginBottom: 8 }}>
            <span className="tby-yr">Winner</span>
            <span className={`tag-win${winner.kind === 'tie' ? ' tie' : ''}`} style={{ marginLeft: 'auto' }}>
              {winner.label}
            </span>
          </div>
          <div className="tby-row" style={{ marginBottom: 16 }}>
            <span className="tby-yr">Votes in race</span>
            <span className="tby-v"><b>{total}</b><small> {positionShare}% of total turnout</small></span>
          </div>

          {rows.length === 0 ? (
            <div className="state-block">
              <strong>No candidates yet</strong>
              <small>Add candidates for this position to show the live distribution.</small>
            </div>
          ) : (
            rows.map((row, index) => (
              <div className="tby-row" role="listitem" key={row.candidate.id}>
                <span className="tby-yr">
                  <span className="av" style={{ marginRight: 10 }}>
                    {row.candidate.photoURL ? (
                      <img src={row.candidate.photoURL} alt="" />
                    ) : (
                      initials(row.candidate.name)
                    )}
                  </span>
                  <span>
                    {row.candidate.name}
                    <small> · {yearLabel(row.candidate.yearLevel)}</small>
                  </span>
                </span>
                <div className="tby-track" aria-hidden="true">
                  <div
                    className="fill"
                    style={{
                      width: `${row.share}%`,
                      background: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
                <span className="tby-v">
                  <b>{row.votes}</b>
                  <small> {row.share}%</small>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
