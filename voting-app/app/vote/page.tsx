'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { hasVotedInElection, isStudentSession } from '@/lib/auth/guards-core';
import { signOut } from '@/lib/auth/session';
import { loadCandidatesForPositions, loadElection, loadRequiredPositions } from '@/lib/student/ballotData';
import { ELECTION_ID } from '@/lib/constants';
import type { Candidate, Election, Position } from '@/lib/types';
import BallotContent from '@/components/ballot/BallotContent';

type PageState = 'loading' | 'denied' | 'already-voted' | 'ready' | 'error';

export default function VotePage() {
  const router = useRouter();
  const { session, loading } = useSession();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [deniedReason, setDeniedReason] = useState('');
  const [election, setElection] = useState<Election | null>(null);
  const [requiredPositions, setRequiredPositions] = useState<Position[]>([]);
  const [candidatesByPosition, setCandidatesByPosition] = useState<Record<string, Candidate[]>>({});
  const [errorMsg, setErrorMsg] = useState('');
  // Guard: only request the ballot once. Without this, a session update (e.g.
  // a background token refresh) would re-run the effect and reload the ballot
  // mid-vote, resetting the page to a loading state.
  const ballotRequested = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!session?.user) {
      router.replace('/');
      return;
    }

    if (!isStudentSession(session)) {
      setDeniedReason('No voter profile was found for this account.');
      setPageState('denied');
      return;
    }

    if (hasVotedInElection(session.voterProfile, ELECTION_ID)) {
      setPageState('already-voted');
      return;
    }

    if (ballotRequested.current) return;
    ballotRequested.current = true;

    async function loadBallot() {
      try {
        const electionData = await loadElection();
        setElection(electionData);

        const positions = await loadRequiredPositions(session!.voterProfile!.yearLevel);
        setRequiredPositions(positions);

        const byPosition = await loadCandidatesForPositions(positions);
        setCandidatesByPosition(byPosition);

        setPageState('ready');
      } catch (err) {
        setErrorMsg((err as Error).message || 'Unable to load the ballot.');
        setPageState('error');
      }
    }

    loadBallot();
  }, [session, loading, router]);

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  if (loading || pageState === 'loading') {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-reveal data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>Checking session...</h1>
          <p className="lede">Please wait while your voter profile is loaded.</p>
        </section>
      </main>
    );
  }

  if (pageState === 'denied') {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-reveal data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>Access denied</h1>
          <p className="lede">{deniedReason}</p>
          <div className="action-row">
            <button className="btn btn-ghost" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (pageState === 'error') {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-reveal data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>Ballot unavailable</h1>
          <p className="lede">{errorMsg}</p>
          <div className="action-row">
            <button className="btn btn-ghost" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell ballot-page">
      <BallotContent
        user={session!.user!}
        voterProfile={session!.voterProfile!}
        election={election!}
        requiredPositions={requiredPositions}
        candidatesByPosition={candidatesByPosition}
        onSignOut={handleSignOut}
        alreadyVoted={pageState === 'already-voted'}
      />
    </main>
  );
}
