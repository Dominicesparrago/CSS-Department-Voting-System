'use client';

import BrandMark from '@/components/BrandMark';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LogOut, LockKeyhole, Vote } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Candidate, Election, Position, Selections, VoterProfile } from '@/lib/types';
import { isBallotComplete, selectedCandidatesByPosition, unansweredPositions } from '@/lib/student/ballotState';
import { submitCompleteBallot } from '@/lib/student/voteSubmit';
import { yearLabel as sharedYearLabel } from '@/lib/format';
import { initials } from '@/lib/initials';
import CandidateModal from './CandidateModal';

interface Props {
  user: User;
  voterProfile: VoterProfile;
  election: Election;
  requiredPositions: Position[];
  candidatesByPosition: Record<string, Candidate[]>;
  onSignOut: () => void;
  alreadyVoted?: boolean;
}

function placeholderAvatar(name: string): string {
  const initial = encodeURIComponent((name || '?').slice(0, 1).toUpperCase());
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%233bd6b0'/%3E%3Cstop offset='0.45' stop-color='%231cabb8'/%3E%3Cstop offset='1' stop-color='%2322b8a0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='320' height='320' rx='40' fill='url(%23g)'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' dominant-baseline='middle' font-family='Figtree, Arial' font-size='132' font-weight='900' fill='%230a0e0f'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function yearLabel(yearLevel?: number): string {
  return sharedYearLabel(yearLevel, 'Year pending');
}

function electionStatusCopy(status: Election['status']) {
  if (status === 'draft') {
    return {
      eyebrow: 'Voting not open',
      title: "Voting hasn't started yet.",
      body: "You're registered and ready. Come back when the election committee opens the polls.",
      tone: 'warn',
    };
  }

  if (status === 'closed') {
    return {
      eyebrow: 'Polls closed',
      title: 'Voting has ended.',
      body: 'The voting period for this election has closed. Official results will be published after review.',
      tone: 'warn',
    };
  }

  return {
    eyebrow: 'Voting unavailable',
    title: 'This election is not accepting votes.',
    body: 'Official results may already be published, or the ballot may be temporarily unavailable.',
    tone: 'info',
  };
}

export default function BallotContent({
  user,
  voterProfile,
  election,
  requiredPositions,
  candidatesByPosition,
  onSignOut,
  alreadyVoted,
}: Props) {
  const [selections, setSelections] = useState<Selections>({});
  const [reviewing, setReviewing] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modalState, setModalState] = useState<{ position: Position | null; candidate: Candidate | null }>({ position: null, candidate: null });
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  const selectedCount = requiredPositions.filter((p) => selections[p.id]).length;
  const complete = isBallotComplete(requiredPositions, selections);
  const progressPercent = requiredPositions.length ? Math.round((selectedCount / requiredPositions.length) * 100) : 0;
  const unanswered = unansweredPositions(requiredPositions, selections);
  const selectedReview = selectedCandidatesByPosition(requiredPositions, candidatesByPosition, selections);
  const nextUnanswered = unanswered[0];
  const ballotCount = requiredPositions.length;

  const facts = useMemo(() => [
    ['Student ID', voterProfile.studentNo ?? 'One-time voter'],
    ['Year level', yearLabel(voterProfile.yearLevel)],
    ['Section', voterProfile.section],
    ['Status', 'Not yet voted'],
  ], [voterProfile]);

  const select = useCallback((positionId: string, candidateId: string) => {
    setSelections((prev) => ({ ...prev, [positionId]: candidateId }));
  }, []);

  useEffect(() => {
    if (!reviewing) return;
    document.body.classList.add('no-scroll');
    sheetCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReviewing(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
    };
  }, [reviewing]);

  async function handleConfirm() {
    setSubmitMsg('');
    setSubmitBusy(true);
    try {
      await submitCompleteBallot({ user, voterProfile, election, requiredPositions, selections });
      setSubmitted(true);
      setReviewing(false);
    } catch (err) {
      setSubmitMsg((err as Error).message || 'Unable to submit your vote.');
    } finally {
      setSubmitBusy(false);
    }
  }

  if (alreadyVoted || submitted) {
    return (
      <BallotStateShell onSignOut={onSignOut}>
        <div className="ballot-terminal-state info">
          <div className="state-badge"><LockKeyhole size={42} /></div>
          <p className="eyebrow">{submitted ? 'Ballot submitted' : 'Already voted'}</p>
          <h1>{submitted ? 'Your vote is recorded' : "You've already voted."}</h1>
          <p className="lede">
            {submitted
              ? 'Thanks for voting. Your ballot was submitted and counted exactly once.'
              : 'Our records show you already cast your ballot for this election. Each student may vote once.'}
          </p>
          <div className="route-ref">Election record: <strong>{election.id}</strong></div>
          <div className="action-row">
            {!voterProfile.guest && <a className="btn btn-primary" href="/dashboard">Back to dashboard</a>}
            <a className="btn btn-ghost" href="/results">View results</a>
          </div>
        </div>
      </BallotStateShell>
    );
  }

  if (election.status !== 'open') {
    const copy = electionStatusCopy(election.status);
    return (
      <BallotStateShell onSignOut={onSignOut}>
        <div className={`ballot-terminal-state ${copy.tone}`}>
          <div className="state-badge"><Vote size={42} /></div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.body}</p>
          <div className="route-ref">Election status: <strong>{election.status}</strong></div>
          <div className="action-row">
            {!voterProfile.guest && <a className="btn btn-primary" href="/dashboard">Go to dashboard</a>}
            <a className="btn btn-ghost" href="/results">See results</a>
          </div>
        </div>
      </BallotStateShell>
    );
  }

  return (
    <>
      <section className="ballot-route" id="student-route">
        <BallotNav onSignOut={onSignOut} />

        <div className="wrap ballot-wrap">
          <section className="ballot-intro">
            <p className="eyebrow">Verified voter</p>
            <h1>Welcome, <span className="grad">{voterProfile.fullName}</span></h1>
            <p>
              Your ballot covers 16 department positions plus your year representative - {ballotCount} races in all.
              Make a selection in every race, then open the progress button to review and submit.
            </p>
            <dl className="ballot-facts">
              {facts.map(([label, value]) => (
                <div className="fact" key={label}>
                  <dt>{label}</dt>
                  <dd className={label === 'Status' ? 'ok' : ''}>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="section-label ballot-section-label">
            <span className="eyebrow">Your ballot</span>
            <small>{selectedCount} / {ballotCount} races selected</small>
          </div>

          <div className="ballot-layout">
            <aside className="ballot-map-rail" aria-label="Ballot map">
              <div className="rail-heading">{'// ballot map'}</div>
              <div className="rail-list">
                {requiredPositions.map((position, index) => {
                  const answered = Boolean(selections[position.id]);
                  return (
                    <a
                      key={position.id}
                      className={answered ? 'is-complete' : ''}
                      href={`#race-${position.id}`}
                    >
                      <span className="rail-dot" aria-hidden="true" />
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{position.name}</strong>
                    </a>
                  );
                })}
              </div>
            </aside>

            <div className="ballot-main">
              <div className="race-list" id="race-list">
                {requiredPositions.map((position, index) => {
                  const answered = Boolean(selections[position.id]);
                  const activeCandidates = candidatesByPosition[position.id] ?? [];
                  return (
                    <section
                      key={position.id}
                      id={`race-${position.id}`}
                      className={`race-card ballot-race${answered ? ' is-answered' : ' is-unanswered'}`}
                    >
                      <div className="race-header">
                        <div>
                          <span className="race-index">{String(index + 1).padStart(2, '0')}</span>
                          <h2>{position.name}</h2>
                        </div>
                        <span className="race-status">
                          <span className="d" />
                          {answered ? 'Selected' : 'Required'}
                        </span>
                      </div>
                      <p className="race-hint">Choose exactly one candidate for this race.</p>

                      <div className="candidate-list" role="radiogroup" aria-label={`${position.name} candidates`}>
                        {activeCandidates.length === 0 ? (
                          <p className="empty-race">No active candidates are available for this race yet.</p>
                        ) : (
                          activeCandidates.map((candidate) => {
                            const picked = selections[position.id] === candidate.id;
                            return (
                              <label
                                key={candidate.id}
                                className={`candidate-card ballot-candidate${picked ? ' is-selected' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name={`race-${position.id}`}
                                  value={candidate.id}
                                  checked={picked}
                                  onChange={() => select(position.id, candidate.id)}
                                />
                                <span className="badge-sel">Selected</span>
                                <span className="candidate-photo">
                                  <img alt="" src={candidate.photoURL || placeholderAvatar(candidate.name)} />
                                </span>
                                <span className="candidate-content">
                                  <strong>{candidate.name}</strong>
                                  <span className="candidate-meta">
                                    {candidate.section || 'Section TBA'} · {yearLabel(candidate.yearLevel)}
                                  </span>
                                  <span className="candidate-label">Platform</span>
                                  <span className="candidate-platform">
                                    {candidate.platform || 'Platform to be announced.'}
                                  </span>
                                  <span className="candidate-label">Other details</span>
                                  <span className="candidate-details">
                                    <span>{yearLabel(candidate.yearLevel)}</span>
                                    <span>{candidate.section || 'Section TBA'}</span>
                                    {candidate.party && <span>{candidate.party}</span>}
                                  </span>
                                </span>
                                <span className="candidate-pick">
                                  <span className="candidate-radio" />
                                  {picked ? 'Selected' : 'Select candidate'}
                                </span>
                                <button
                                  type="button"
                                  className="viewmore"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setModalState({ position, candidate });
                                  }}
                                >
                                  View candidate information
                                </button>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ballot-end">
            <a className="btn btn-ghost" href="#student-route">Back to top</a>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!complete}
              onClick={() => setReviewing(true)}
            >
              Review ballot <span className="arr">-&gt;</span>
            </button>
          </div>
        </div>
      </section>

      <button
        className={`ballot-fab${complete ? ' ready' : ''}`}
        type="button"
        aria-label={`Voting progress: ${progressPercent} percent.`}
        style={{ '--p': progressPercent } as CSSProperties}
        onClick={() => {
          if (complete) setReviewing(true);
          else if (nextUnanswered) window.location.hash = `race-${nextUnanswered.id}`;
        }}
      >
        <span className="inner">
          <span>
            <span className="pct">{progressPercent}%</span>
            <br />
            <span className="lbl">{complete ? 'Review' : 'Progress'}</span>
          </span>
        </span>
      </button>

      <button
        className={`mobile-ballot-bar${complete ? ' ready' : ''}`}
        type="button"
        style={{ '--p': progressPercent } as CSSProperties}
        onClick={() => {
          if (complete) setReviewing(true);
          else if (nextUnanswered) window.location.hash = `race-${nextUnanswered.id}`;
        }}
      >
        <span className="mp-ring"><span>{progressPercent}%</span></span>
        <span className="mp-text">
          <strong>{selectedCount} / {ballotCount} selected</strong>
          <small>{complete ? 'Tap to review your ballot' : 'Tap to jump to the next race'}</small>
        </span>
        <span className="mp-cta">{complete ? 'Review' : 'Next'}</span>
      </button>

      {reviewing && (
        <div className="ballot-sheet" role="dialog" aria-modal="true" aria-label="Review your ballot">
          <div className="sheet-panel">
            <div className="sheet-head">
              <div>
                <h2>Review your ballot</h2>
                <p>Check every selection. Submitting is final and counted exactly once.</p>
              </div>
              <button ref={sheetCloseRef} className="sclose" type="button" onClick={() => setReviewing(false)} aria-label="Back to ballot">x</button>
            </div>
            <div className="warn">Once submitted you cannot change your ballot.</div>
            <div className="rlist">
              {selectedReview.map(({ position, candidate }) => (
                <div key={position.id} className="ritem">
                  <div className="who">
                    <span className="av">{candidate ? initials(candidate.name) : '--'}</span>
                    <div>
                      <div className="pos">{position.name}</div>
                      <div className="nm">{candidate?.name || 'Awaiting selection'}</div>
                    </div>
                  </div>
                  <a href={`#race-${position.id}`} onClick={() => setReviewing(false)}>Edit</a>
                </div>
              ))}
            </div>
            {unanswered.length > 0 && (
              <p className="form-message" role="status">{unanswered.length} races still need a selection.</p>
            )}
            {submitMsg && <p className="form-message" role="status">{submitMsg}</p>}
            <div className="sheet-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setReviewing(false)}>Back to ballot</button>
              <button className="btn btn-primary" type="button" disabled={!complete || submitBusy} onClick={handleConfirm}>
                {submitBusy ? 'Submitting...' : 'Submit final vote'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CandidateModal
        position={modalState.position}
        candidate={modalState.candidate}
        onClose={() => setModalState({ position: null, candidate: null })}
      />
    </>
  );
}

function BallotNav({ onSignOut }: { onSignOut: () => void }) {
  return (
    <nav className="ballot-route-nav">
      <a className="terminal-brand" href="/">
        <BrandMark />
        <span className="nav-brand-text">
          <strong>CSS Voting</strong>
          <small>Ballot</small>
        </span>
      </a>
      <button className="btn btn-ghost btn-sm" type="button" onClick={onSignOut}>
        <LogOut size={14} style={{ marginRight: 6 }} />
        Sign out
      </button>
    </nav>
  );
}

function BallotStateShell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  return (
    <section className="ballot-route ballot-state-route">
      <BallotNav onSignOut={onSignOut} />
      <div className="ballot-state-wrap">
        {children}
      </div>
    </section>
  );
}
