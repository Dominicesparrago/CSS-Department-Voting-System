'use client';

import { useState, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import type { Candidate, Election, Position, Selections, VoterProfile } from '@/lib/types';
import { isBallotComplete, selectedCandidatesByPosition, unansweredPositions } from '@/lib/student/ballotState';
import { submitCompleteBallot } from '@/lib/student/voteSubmit';
import CandidateModal from './CandidateModal';
import type { User } from 'firebase/auth';

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
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%231c2b2d'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' dominant-baseline='middle' font-family='Figtree, Arial' font-size='72' font-weight='800' fill='%2322b8a0'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

export default function BallotContent({
  user, voterProfile, election, requiredPositions, candidatesByPosition, onSignOut, alreadyVoted,
}: Props) {
  const [selections, setSelections] = useState<Selections>({});
  const [reviewing, setReviewing] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modalState, setModalState] = useState<{ position: Position | null; candidate: Candidate | null }>({ position: null, candidate: null });

  const select = useCallback((positionId: string, candidateId: string) => {
    setSelections((prev) => ({ ...prev, [positionId]: candidateId }));
  }, []);

  const selectedCount = requiredPositions.filter((p) => selections[p.id]).length;
  const complete = isBallotComplete(requiredPositions, selections);

  async function handleConfirm() {
    setSubmitMsg('');
    setSubmitBusy(true);
    try {
      await submitCompleteBallot({ user, voterProfile, election, requiredPositions, selections });
      setSubmitted(true);
    } catch (err) {
      setSubmitMsg((err as Error).message || 'Unable to submit your vote.');
    } finally {
      setSubmitBusy(false);
    }
  }

  if (alreadyVoted || submitted) {
    return (
      <section className="status-panel" id="student-route" data-reveal data-spot>
        <ProfileHead voterProfile={voterProfile} onSignOut={onSignOut} />
        <p className="eyebrow">Student Ballot</p>
        <h1>{submitted ? 'Vote submitted' : 'You have already voted'}</h1>
        <p className="lede">
          {submitted
            ? 'Your ballot was submitted successfully.'
            : 'Your vote is recorded for this election. The ballot cannot be reopened.'}
        </p>
      </section>
    );
  }

  if (election.status !== 'open') {
    return (
      <section className="status-panel" id="student-route" data-reveal data-spot>
        <ProfileHead voterProfile={voterProfile} onSignOut={onSignOut} />
        <p className="eyebrow">Student Ballot</p>
        <h1>Voting is not open</h1>
        <p className="lede">This election is not accepting votes right now.</p>
      </section>
    );
  }

  return (
    <>
      <section className="status-panel" id="student-route" data-reveal data-spot>
        <ProfileHead voterProfile={voterProfile} onSignOut={onSignOut} />

        <div className="ballot-head">
          <div>
            <p className="eyebrow">Student Ballot</p>
            <h1 id="route-title">{election.title || 'CSS Department Election'}</h1>
            <p id="route-message" className="lede">Select exactly one candidate for every race.</p>
          </div>
        </div>

        <dl className="profile-list compact" id="profile-list">
          <div><dt>Name</dt><dd>{voterProfile.fullName}</dd></div>
          <div><dt>Student ID</dt><dd>{voterProfile.studentNo}</dd></div>
          <div><dt>Year</dt><dd>Year {voterProfile.yearLevel}</dd></div>
          <div><dt>Section</dt><dd>{voterProfile.section}</dd></div>
        </dl>

        {/* toolbar */}
        <div className="ballot-toolbar" id="ballot-toolbar">
          <div className="toolbar-progress">
            <span className="progress-ring" data-progress-ring aria-hidden="true">
              <span data-progress-value>0%</span>
            </span>
            <p id="ballot-progress">{selectedCount} of {requiredPositions.length} races selected</p>
          </div>
          <button
            className="btn btn-primary"
            id="review-button"
            type="button"
            disabled={!complete}
            onClick={() => setReviewing(true)}
          >
            Review ballot
          </button>
        </div>

        {/* races */}
        <div className="race-list" id="race-list">
          {requiredPositions.map((position) => {
            const answered = Boolean(selections[position.id]);
            const activeCandidates = candidatesByPosition[position.id] ?? [];
            return (
              <section
                key={position.id}
                className={`race-card${answered ? '' : ' is-unanswered'}`}
                data-race-id={position.id}
              >
                <div className="race-header">
                  <h2>{position.name}</h2>
                  <span className="race-status">Required</span>
                </div>
                <div className="candidate-list">
                  {activeCandidates.length === 0 ? (
                    <p className="empty-race">No active candidates are available for this race yet.</p>
                  ) : (
                    activeCandidates.map((candidate) => (
                      <label
                        key={candidate.id}
                        className="candidate-card"
                        data-candidate-id={candidate.id}
                      >
                        <input
                          type="radio"
                          name={`race-${position.id}`}
                          value={candidate.id}
                          checked={selections[position.id] === candidate.id}
                          onChange={() => select(position.id, candidate.id)}
                        />
                        <img
                          alt=""
                          src={candidate.photoURL || placeholderAvatar(candidate.name)}
                        />
                        <span className="candidate-content">
                          <strong>{candidate.name}</strong>
                          <span className="candidate-meta">
                            {position.name} · {candidate.section || 'Section TBA'} · Year {candidate.yearLevel}
                          </span>
                          <span className="candidate-platform">
                            {candidate.platform || 'Platform to be announced.'}
                          </span>
                          {candidate.party && (
                            <span className="candidate-party">{candidate.party}</span>
                          )}
                        </span>
                        <div className="candidate-actions">
                          <button
                            type="button"
                            className="btn-info"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setModalState({ position, candidate });
                            }}
                          >
                            View Candidate Information
                          </button>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* review panel */}
        {reviewing && (
          <section className="review-panel" id="review-panel" aria-live="polite">
            <div className="review-head">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Confirm your selections</h2>
              </div>
              <button className="btn btn-ghost" id="edit-button" type="button" onClick={() => setReviewing(false)}>
                Edit
              </button>
            </div>
            <p className="warning-text">Submitting is final and cannot be changed.</p>
            <div className="review-list" id="review-list">
              {selectedCandidatesByPosition(requiredPositions, candidatesByPosition, selections).map(
                ({ position, candidate }) => (
                  <div key={position.id} className="review-item">
                    <span>{position.name}</span>
                    <strong>{candidate?.name || 'Missing candidate'}</strong>
                  </div>
                ),
              )}
            </div>
            {submitMsg && <p className="form-message" role="status">{submitMsg}</p>}
            <button
              className="btn btn-primary"
              id="confirm-button"
              type="button"
              disabled={submitBusy}
              onClick={handleConfirm}
            >
              {submitBusy ? 'Submitting...' : 'Confirm vote'}
            </button>
          </section>
        )}
      </section>

      <CandidateModal
        position={modalState.position}
        candidate={modalState.candidate}
        onClose={() => setModalState({ position: null, candidate: null })}
      />
    </>
  );
}

function ProfileHead({ voterProfile, onSignOut }: { voterProfile: VoterProfile; onSignOut: () => void }) {
  return (
    <div className="ballot-head">
      <div className="brand-lockup">
        <div className="brand-logos">
          <span className="brand-logo scc">
            <img src="/assets/scc_logo.png" alt="St. Clare College of Caloocan logo" />
          </span>
          <span className="brand-logo dept">
            <img src="/assets/department_logo.png" alt="Computer Science Department logo" />
          </span>
        </div>
        <div className="brand-text">
          <p className="brand-inst">St. Clare College of Caloocan</p>
          <p className="brand-sub">Computer Science Department</p>
        </div>
      </div>
      <button className="btn btn-ghost" id="sign-out-button" type="button" onClick={onSignOut}>
        <LogOut size={14} style={{ marginRight: 6 }} />
        Sign out
      </button>
    </div>
  );
}
