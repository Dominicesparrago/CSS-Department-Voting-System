'use client';

import { useEffect, useState } from 'react';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { hasVotedInElection, isStudentSession } from '@/lib/auth/guards-core';
import { loadCandidatesForPositions, loadElection, loadRequiredPositions } from '@/lib/student/ballotData';
import { ELECTION_ID } from '@/lib/constants';
import type { Candidate, Election, Position } from '@/lib/types';
import BallotContent from '@/components/ballot/BallotContent';
import RouteLoading from '@/components/RouteLoading';

interface BallotData {
  election: Election;
  requiredPositions: Position[];
  candidatesByPosition: Record<string, Candidate[]>;
}

export default function VotePage() {
  const { session, status, deniedReason, signOutToHome } = useGuardedSession((current) => {
    if (!current.user) return { kind: 'redirect', to: '/' };
    if (!isStudentSession(current)) return { kind: 'deny', reason: 'No voter profile was found for this account.' };
    return { kind: 'allow' };
  }, 'Unable to load your session.');

  const alreadyVoted = hasVotedInElection(session?.voterProfile ?? null, ELECTION_ID);
  const yearLevel = session?.voterProfile?.yearLevel;
  const [ballot, setBallot] = useState<BallotData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (status !== 'ready' || alreadyVoted || yearLevel === undefined) return;
    let active = true;

    async function loadBallot() {
      try {
        const election = await loadElection();
        const requiredPositions = await loadRequiredPositions(yearLevel!);
        const candidatesByPosition = await loadCandidatesForPositions(requiredPositions);
        if (active) setBallot({ election, requiredPositions, candidatesByPosition });
      } catch (err) {
        if (active) setErrorMsg((err as Error).message || 'Unable to load the ballot.');
      }
    }

    void loadBallot();
    return () => {
      active = false;
    };
  }, [status, alreadyVoted, yearLevel]);

  if (status === 'loading') return <RouteLoading />;

  if (status === 'denied' || errorMsg) {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>{errorMsg ? 'Ballot unavailable' : 'Access denied'}</h1>
          <p className="lede">{errorMsg || deniedReason}</p>
          <div className="action-row">
            <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (!alreadyVoted && !ballot) return <RouteLoading />;

  return (
    <main className="page-shell ballot-page">
      <BallotContent
        user={session!.user!}
        voterProfile={session!.voterProfile!}
        /* already-voted renders before any status check, so the fallback election
           object only ever surfaces its id in the "Election record" line */
        election={ballot?.election ?? { id: ELECTION_ID, status: 'open' }}
        requiredPositions={ballot?.requiredPositions ?? []}
        candidatesByPosition={ballot?.candidatesByPosition ?? {}}
        onSignOut={signOutToHome}
        alreadyVoted={alreadyVoted}
      />
    </main>
  );
}
