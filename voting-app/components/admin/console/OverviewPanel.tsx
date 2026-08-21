'use client';

import { useMemo } from 'react';
import { BarChart3, CheckSquare, Contact, Users } from 'lucide-react';
import AnimatedBarFill from '@/components/admin/AnimatedBarFill';
import CountUp from '@/components/CountUp';
import type { CustomSelectOption } from '@/components/ui/CustomSelect';
import { resultsToCsv, type Aggregate } from '@/lib/admin/adminCore';
import { ELECTION_ID } from '@/lib/constants';
import { percent, yearLabel } from '@/lib/format';
import type { Candidate, Election, Position, Voter } from '@/lib/types';
import LiveVoteSummary from '../LiveVoteSummary';
import MomentumArea from './MomentumArea';
import { downloadFile, type AdminPanel } from './shared';

const STATUS_META: Record<Election['status'], { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'is-draft' },
  open: { label: 'Voting open', cls: 'is-open' },
  closed: { label: 'Voting closed', cls: 'is-closed' },
  published: { label: 'Results published', cls: 'is-published' },
  finalized: { label: 'Results finalized', cls: 'is-finalized' },
  archived: { label: 'Archived', cls: 'is-archived' },
};

interface OverviewPanelProps {
  active: boolean;
  election: Election | null;
  aggregate: Aggregate;
  candidates: Candidate[];
  positions: Position[];
  voters: Voter[];
  positionOptions: CustomSelectOption[];
  onNavigate: (panel: AdminPanel) => void;
}

export default function OverviewPanel({
  active,
  election,
  aggregate,
  candidates,
  positions,
  voters,
  positionOptions,
  onNavigate,
}: OverviewPanelProps) {
  const turnoutPercent = percent(aggregate.turnout.total, aggregate.eligible.total);
  const activeCandidates = candidates.filter((candidate) => candidate.active).length;
  const statusMeta = STATUS_META[election?.status ?? 'draft'];
  // Ballots are anonymous and never readable by clients, so the curve derives
  // from each voter's participation lock (`votedAt`) — one timestamp per cast
  // ballot, which is exactly the data the momentum chart needs.
  const momentumBallots = useMemo(
    () => voters
      .filter((voter) => voter.hasVoted?.[ELECTION_ID] === true && voter.votedAt?.[ELECTION_ID] != null)
      .map((voter) => ({ votedAt: voter.votedAt![ELECTION_ID].toDate() })),
    [voters],
  );
  const turnoutByYear = useMemo(
    () => [1, 2, 3, 4].map((year) => ({
      year,
      voted: aggregate.turnout.byYear[String(year)] ?? 0,
      eligible: aggregate.eligible.byYear[String(year)] ?? 0,
    })),
    [aggregate],
  );
  const isDraft = (election?.status ?? 'draft') === 'draft';
  const registrationOpen = election?.registrationOpen ?? true;
  const positionsCovered = useMemo(
    () => positions.filter((position) => candidates.some((c) => c.positionId === position.id && c.active)).length,
    [positions, candidates],
  );
  const setupCandidatesDone = positions.length > 0 && positionsCovered === positions.length;
  const setupVotersDone = aggregate.eligible.total > 0;
  const setupReady = setupCandidatesDone && setupVotersDone;

  return (
    <section className={`panel${active ? ' on' : ''}`} data-p="overview">
      <div className="head">
        <div>
          <span className="eyebrow">Election control</span>
          <div className="h1row">
            <h1>Overview</h1>
            <span className={`status-pill ${statusMeta.cls}`}>{statusMeta.label}</span>
          </div>
          <p>Live snapshot of {election?.title ?? 'the CSS Department election'}.</p>
        </div>
        <div className="head-actions">
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => downloadFile(`css-results-${ELECTION_ID}.csv`, resultsToCsv({ results: { perCandidate: aggregate.perCandidate, perPosition: aggregate.perPosition }, candidates, positions }), 'text/csv;charset=utf-8')}
          >
            Export CSV
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onNavigate('candidates')}>
            + Add candidate
          </button>
        </div>
      </div>

      <div className="metrics">
        {[
          { icon: Users, value: aggregate.eligible.total, suffix: '', label: 'Registered voters' },
          { icon: CheckSquare, value: aggregate.turnout.total, suffix: '', label: 'Ballots cast' },
          { icon: BarChart3, value: turnoutPercent, suffix: '%', label: 'Turnout' },
          { icon: Contact, value: activeCandidates, suffix: '', label: 'Candidates' },
        ].map(({ icon: Icon, value, suffix, label }) => (
          <div className="metric" key={label}>
            <span className="ic"><Icon className="icon" style={{ width: 24, height: 24 }} aria-hidden="true" /></span>
            <div>
              <div className="num grad"><CountUp value={value} />{suffix}</div>
              <div className="lbl">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {isDraft ? (
        <div className="ov-block">
          <div className="block-label"><h2>Election setup</h2><small>complete these before opening voting</small></div>
          {setupReady && <p className="form-message" role="status">All set — open voting from Lifecycle when you&apos;re ready.</p>}
          <ul className="setup-list">
            <li className={`setup-row${setupCandidatesDone ? ' done' : ''}`}>
              <span className="setup-dot" aria-hidden="true" />
              <div><b>Add candidates</b><div className="sv">{positionsCovered} of {positions.length} positions have an active candidate</div></div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate('candidates')}>Manage candidates</button>
            </li>
            <li className={`setup-row${setupVotersDone ? ' done' : ''}`}>
              <span className="setup-dot" aria-hidden="true" />
              <div><b>Register voters</b><div className="sv">{aggregate.eligible.total} eligible voter{aggregate.eligible.total === 1 ? '' : 's'} registered</div></div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate('voters')}>View voters</button>
            </li>
            <li className={`setup-row${registrationOpen ? ' done' : ''}`}>
              <span className="setup-dot" aria-hidden="true" />
              <div><b>Registration</b><div className="sv">Currently {registrationOpen ? 'open — students can sign up' : 'closed — students cannot sign up'}</div></div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate('lifecycle')}>Lifecycle</button>
            </li>
            <li className="setup-row">
              <span className="setup-dot" aria-hidden="true" />
              <div><b>Open voting</b><div className="sv">{setupReady ? 'Everything is ready.' : 'Finish the steps above first.'}</div></div>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => onNavigate('lifecycle')}>Open voting</button>
            </li>
          </ul>
        </div>
      ) : (
        <>
          <LiveVoteSummary
            aggregate={aggregate}
            candidates={candidates}
            positions={positions}
            positionOptions={positionOptions}
          />

          <div className="ov-block">
            <div className="block-label"><h2>Turnout</h2><small>ballots cast vs. registered</small></div>
            <div className="turnout-grid">
              <div className="ring-wrap">
                <div
                  className="donut"
                  style={{ background: `conic-gradient(var(--brand) 0 ${turnoutPercent}%, var(--track) ${turnoutPercent}% 100%)` }}
                >
                  <div className="hole"><div><b className="grad"><CountUp value={turnoutPercent} />%</b><small>{aggregate.turnout.total} / {aggregate.eligible.total}</small></div></div>
                </div>
                <p className="ring-cap">Share of registered voters who have cast a ballot.</p>
              </div>
              <div className="tby" role="list" aria-label="Turnout by year level">
                {turnoutByYear.map(({ year, voted, eligible }) => {
                  const pct = percent(voted, eligible);
                  return (
                    <div className="tby-row" role="listitem" key={year}>
                      <span className="tby-yr">{yearLabel(year)}</span>
                      <div className="tby-track"><AnimatedBarFill width={pct} /></div>
                      <span className="tby-v"><b>{voted}</b><small>/ {eligible} · {pct}%</small></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ov-block">
            <div className="block-label"><h2>Turnout momentum</h2><small>cumulative ballots over time</small></div>
            <MomentumArea ballots={momentumBallots} />
          </div>
        </>
      )}
    </section>
  );
}
