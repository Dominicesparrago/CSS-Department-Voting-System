'use client';

import { useEffect, useState } from 'react';
import { useGuardedSession } from '@/hooks/useGuardedSession';
import { loadAppConfig } from '@/lib/appConfig';
import { friendlyAuthError } from '@/lib/auth/errors';
import { hasVotedInElection, isStudentSession } from '@/lib/auth/guards-core';
import { loadCandidatesForPositions, loadElection, loadRequiredPositions } from '@/lib/student/ballotData';
import { checkRosterEligibility, ROSTER_DENIAL_COPY, type RosterDenialReason } from '@/lib/student/rosterStatus';
import { watchElection } from '@/lib/election/electionRepo';
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
  const [maintenance, setMaintenance] = useState(false);
  const [rosterDenial, setRosterDenial] = useState<RosterDenialReason | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (status !== 'ready' || alreadyVoted || yearLevel === undefined) return;
    let active = true;

    async function loadBallot() {
      try {
        const config = await loadAppConfig();
        if (config.maintenanceMode) {
          if (active) {
            window.clearTimeout(timeoutId);
            setMaintenance(true);
          }
          return;
        }
        // Early roster check (read-only, fails open). The submitBallot function
        // re-verifies every condition server-side, so this is UX, not security.
        const roster = await checkRosterEligibility(session?.voterProfile ?? null);
        if (active && !roster.ok && roster.reason) {
          window.clearTimeout(timeoutId);
          setRosterDenial(roster.reason);
          return;
        }
        const election = await loadElection();
        const requiredPositions = await loadRequiredPositions(yearLevel!);
        const candidatesByPosition = await loadCandidatesForPositions(requiredPositions);
        if (active) {
          window.clearTimeout(timeoutId);
          setBallot({ election, requiredPositions, candidatesByPosition });
        }
      } catch (err) {
        // Firebase-coded errors (network, permission, unavailable) get friendly
        // copy; our own thrown messages (e.g. "Election was not found.") pass through.
        const e = err as { code?: string; message?: string };
        if (active) {
          window.clearTimeout(timeoutId);
          setErrorMsg(e.code ? friendlyAuthError(err) : e.message || 'Unable to load the ballot.');
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      active = false;
      setErrorMsg('The ballot is taking longer than expected to load. Please retry.');
    }, 15000);

    void loadBallot();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [status, alreadyVoted, yearLevel, retryKey]);

  useEffect(() => {
    if (status !== 'ready' || alreadyVoted) return;
    return watchElection(
      (nextElection) => setBallot((current) => current ? { ...current, election: nextElection } : current),
      (error) => setErrorMsg(error.message || 'Unable to verify the current election status.'),
    );
  }, [status, alreadyVoted]);

  if (status === 'loading') return <RouteLoading />;

  if (maintenance) {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>Down for maintenance</h1>
          <p className="lede">The voting platform is temporarily offline while the election committee performs maintenance. Please check back shortly.</p>
          <div className="action-row">
            <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (rosterDenial) {
    const copy = ROSTER_DENIAL_COPY[rosterDenial];
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>Voting denied</h1>
          <p className="lede">{copy.body}</p>
          <div className="action-row">
            <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (status === 'denied' || errorMsg) {
    return (
      <main className="page-shell ballot-page">
        <section className="status-panel" id="student-route" data-spot>
          <p className="eyebrow">Student Ballot</p>
          <h1>{errorMsg ? 'Ballot unavailable' : 'Access denied'}</h1>
          <p className="lede">{errorMsg || deniedReason}</p>
          <div className="action-row">
            {errorMsg && <button className="btn btn-primary" type="button" onClick={() => { setErrorMsg(''); setMaintenance(false); setBallot(null); setRetryKey((current) => current + 1); }}>Retry loading</button>}
            <button className="btn btn-ghost" type="button" onClick={signOutToHome}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  if (!alreadyVoted && !ballot) return <RouteLoading />;

  // The session can become null for one render cycle while sign-out navigates
  // (the guard effect flips status after render). Never render the ballot
  // against a missing session — that throws and surfaces the client error page.
  if (!session?.user || !session?.voterProfile) return <RouteLoading />;

  return (
    <main className="page-shell ballot-page">
      <BallotContent
        user={session.user}
        voterProfile={session.voterProfile}
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
