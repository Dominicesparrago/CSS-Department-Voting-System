import AnimatedBarFill from '@/components/admin/AnimatedBarFill';
import { rankedCandidatesForPosition, type Aggregate } from '@/lib/admin/adminCore';
import { percent, yearLabel } from '@/lib/format';
import { initials } from '@/lib/initials';
import type { Candidate } from '@/lib/types';

interface ResultsBarsProps {
  candidates: Candidate[];
  aggregate: Aggregate;
  positionId: string;
}

/** Ranked vote bars for one position; the top non-zero row is tagged as leading. */
export default function ResultsBars({ candidates, aggregate, positionId }: ResultsBarsProps) {
  const rows = rankedCandidatesForPosition(candidates, aggregate, positionId);
  const positionTotal = aggregate.perPosition[positionId] ?? 0;
  const maxVotes = Math.max(1, ...rows.map((candidate) => candidate.votes));

  if (rows.length === 0) {
    return (
      <div className="state-block">
        <strong>No candidates yet</strong>
        <small>Add a candidate for this position to populate the tally.</small>
      </div>
    );
  }

  return (
    <div className="rbars">
      {rows.map((candidate, index) => {
        const leading = index === 0 && candidate.votes > 0;
        const candidatePercent = percent(candidate.votes, positionTotal);
        const width = Math.round((candidate.votes / maxVotes) * 100);

        return (
          <div className={`rbar${leading ? ' win' : ''}`} key={candidate.id}>
            <span className="av">
              {candidate.photoURL ? (
                <img src={candidate.photoURL} alt={`${candidate.name} portrait`} />
              ) : (
                initials(candidate.name)
              )}
            </span>
            <div className="body">
              <div className="top">
                <span className="nm">
                  {candidate.name}
                  <small> · {yearLabel(candidate.yearLevel)}</small>
                </span>
                {leading && <span className="win-tag">Leading</span>}
                <span className="v">
                  <b>{candidate.votes}</b>
                  <small>{candidatePercent}%</small>
                </span>
              </div>
              <div className="track">
                <AnimatedBarFill width={width} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
