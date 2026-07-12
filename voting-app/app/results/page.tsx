'use client';

import BrandMark from '@/components/BrandMark';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import CountUp from '@/components/CountUp';
import RouteLoading from '@/components/RouteLoading';
import { candidatesForPosition, positionGroup } from '@/lib/election/candidates';
import { formatTimestamp, yearLabel } from '@/lib/format';
import { initials as nameInitials } from '@/lib/initials';
import {
  loadPublicCandidates,
  loadPublicElection,
  loadPublicPositions,
  loadPublishedTally,
  type PublishedTally,
} from '@/lib/results/publicResults';
import type { Candidate, Election, Position } from '@/lib/types';

type FilterKey = 'all' | 'exec' | 'cmte' | 'year';

/** Abstain rows get a dash instead of lettered initials. */
function initials(name: string): string {
  return /abstain/i.test(name) ? '-' : nameInitials(name);
}

function displayTitle(election: Election | null): string {
  const title = election?.title || 'CSS Department Election 2026';
  if (/election\s*2026/i.test(title)) return title.replace(/election\s*2026/i, '').trim();
  if (/2026/i.test(title)) return title.replace(/2026/i, '').trim();
  return title;
}

export default function ResultsPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tally, setTally] = useState<PublishedTally | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unpublished' | 'error'>('loading');
  const [message, setMessage] = useState('Loading official results...');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [electionData, positionsData, candidatesData, tallyData] = await Promise.all([
          loadPublicElection(),
          loadPublicPositions(),
          loadPublicCandidates(),
          loadPublishedTally(),
        ]);
        if (!alive) return;

        setElection(electionData);
        setPositions(positionsData);
        setCandidates(candidatesData);
        setTally(tallyData);

        if (electionData.status !== 'published' || !tallyData) {
          setState('unpublished');
          setMessage('Official results are released after the election is published.');
          return;
        }

        setState('ready');
        setMessage('Final tallies, recomputed from immutable ballot records.');
      } catch (err) {
        if (!alive) return;
        setState('error');
        setMessage((err as Error).message || 'Unable to load official results.');
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const visiblePositions = useMemo(
    () => positions.filter((position) => filter === 'all' || positionGroup(position) === filter),
    [filter, positions],
  );

  const publishedAt = tally?.updatedAt ? formatTimestamp(tally.updatedAt) : '';
  const turnout = tally?.turnout.total ?? 0;
  const heroCopy =
    state === 'ready'
      ? `Final tallies, recomputed from immutable ballot records. Turnout: ${turnout} registered voters counted.`
      : message;
  const chipCopy = publishedAt ? `Published ${publishedAt}` : election?.status ? `Status: ${election.status}` : 'Loading';

  if (state === 'loading') return <RouteLoading />;

  return (
    <>
      <nav className="results-nav">
        <a className="terminal-brand results-terminal-brand" href="/">
          <BrandMark />
          <span className="nav-brand-text">
            <strong>CSS Voting</strong>
            <small>Results · 2026</small>
          </span>
        </a>
        <div className="results-nav-actions">
          <a className="btn btn-ghost btn-sm" href="/dashboard">Dashboard</a>
        </div>
      </nav>

      <main className="results-page">
        <section className="results-hero">
          <span className="eyebrow">Official results</span>
          <h1>{displayTitle(election)} <span className="grad">Election 2026</span></h1>
          <p>{heroCopy}</p>
          <span className="pubchip"><span className="d" />{chipCopy}</span>
        </section>

        {(state === 'unpublished' || state === 'error') && (
          <section className="status-panel route-state-panel" data-spot>
            <div className="route-state-mark">
              <BarChart3 size={34} aria-hidden="true" />
            </div>
            <div>
              <p className="eyebrow">{state === 'error' ? 'Results Error' : 'Results Locked'}</p>
              <h1>{state === 'error' ? 'Unable to load results' : 'Not published yet'}</h1>
              <p className="lede">{message}</p>
            </div>
          </section>
        )}

        {state === 'ready' && tally && (
          <>
            <div className="results-filter filter" role="group" aria-label="Filter result positions">
              {[
                ['all', 'All'],
                ['exec', 'Executive'],
                ['cmte', 'Committees'],
                ['year', 'Year Reps'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? 'is-active on' : ''}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key as FilterKey)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="results-list results">
              {visiblePositions.map((position) => (
                <ResultPosition
                  candidates={candidates}
                  key={position.id}
                  position={position}
                  tally={tally}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function ResultPosition({
  candidates,
  position,
  tally,
}: {
  candidates: Candidate[];
  position: Position;
  tally: PublishedTally;
}) {
  const rows = candidatesForPosition(candidates, position.id)
    .map((candidate) => ({
      candidate,
      votes: tally.perCandidate[candidate.id] ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes || (a.candidate.order || 0) - (b.candidate.order || 0));
  const total = tally.perPosition[position.id] ?? rows.reduce((sum, row) => sum + row.votes, 0);
  const max = Math.max(1, ...rows.map((row) => row.votes));

  return (
    <section className="results-position pos rv" data-group={positionGroup(position)}>
      <div className="results-position-head pos-head">
        <h2>{position.name}</h2>
        <span className="tot"><CountUp value={total} /> votes</span>
      </div>

      <div className="rbars">
        {rows.length === 0 ? (
          <div className="state-block">
            <strong>No candidates</strong>
            <small>No candidates were recorded for this position.</small>
          </div>
        ) : (
          rows.map(({ candidate, votes }, index) => {
            const percent = total ? Math.round((votes / total) * 100) : 0;
            const width = Math.round((votes / max) * 100);
            const winner = index === 0 && votes > 0 && !/abstain/i.test(candidate.name);

            return (
              <article className={`rbar${winner ? ' win' : ''}`} key={candidate.id}>
                <span className="av">
                  {candidate.photoURL ? <img src={candidate.photoURL} alt="" /> : initials(candidate.name)}
                </span>
                <div className="body">
                  <div className="top">
                    <span className="nm">
                      {candidate.name}
                      <small> · {candidate.yearLevel ? yearLabel(candidate.yearLevel) : candidate.section}</small>
                    </span>
                    {winner && <span className="win-tag">Winner</span>}
                    <span className="v">
                      <b><CountUp value={votes} /></b>
                      <small><CountUp value={percent} />%</small>
                    </span>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
