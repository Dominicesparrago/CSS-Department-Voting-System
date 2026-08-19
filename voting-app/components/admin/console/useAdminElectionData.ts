'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadCandidates,
  loadElection,
  loadPositions,
  loadResults,
  loadVoters,
  watchLiveResults,
  watchAudit,
  watchCandidates,
  watchElection,
  watchVoters,
} from '@/lib/admin/adminData';
import { loadStudents, watchStudents } from '@/lib/admin/rosterData';
import { friendlyAdminError } from '@/lib/admin/adminErrors';
import type { ResultsCounts } from '@/lib/admin/adminCore';
import type { AuditEntry, Candidate, Election, Position, RosterStudent, Voter } from '@/lib/types';

const EMPTY_RESULTS: ResultsCounts = { perCandidate: {}, perPosition: {} };

/**
 * Loads the full admin dataset once, then keeps election/candidates/voters/audit
 * live through Firestore subscriptions. Vote counts come from the trusted live
 * tally doc, which the ballot callable updates transactionally on every vote.
 */
export function useAdminElectionData(enabled: boolean) {
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [results, setResults] = useState<ResultsCounts>(EMPTY_RESULTS);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const activeRef = useRef(false);

  const refreshResults = useCallback(async () => {
    try {
      const next = await loadResults();
      if (activeRef.current) {
        setResults(next);
        setErrorMessage('');
      }
    } catch (error) {
      // Keep the last known counts visible, but make a failed live refresh
      // actionable instead of silently presenting stale/zero results.
      if (activeRef.current) setErrorMessage(friendlyAdminError(error, 'Unable to load live results.'));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    const unsubscribers: (() => void)[] = [];

    async function load() {
      try {
        const [nextElection, nextPositions, nextCandidates, nextVoters, nextStudents] = await Promise.all([
          loadElection(),
          loadPositions(),
          loadCandidates(),
          loadVoters(),
          loadStudents(),
        ]);
        if (!activeRef.current) return;

        setElection(nextElection);
        setPositions(nextPositions);
        setCandidates(nextCandidates);
        setVoters(nextVoters);
        setStudents(nextStudents);
        setErrorMessage('');

        unsubscribers.push(
          watchCandidates(setCandidates, (error) => setErrorMessage(error.message)),
          watchVoters(setVoters, (error) => setErrorMessage(error.message)),
          watchStudents(setStudents, (error) => setErrorMessage(error.message)),
          watchElection(setElection, (error) => setErrorMessage(error.message)),
          watchAudit(setAuditEntries, (error) => setErrorMessage(error.message)),
          watchLiveResults(setResults, (error) => setErrorMessage(error.message)),
        );
        await refreshResults();
      } catch (error) {
        if (activeRef.current) setErrorMessage((error as Error).message);
      } finally {
        if (activeRef.current) setLoading(false);
      }
    }

    void load();
    return () => {
      activeRef.current = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [enabled, refreshResults]);

  /** Re-fetch candidates immediately after a mutation instead of waiting on the snapshot. */
  const refreshCandidates = useCallback(async () => {
    setCandidates(await loadCandidates());
  }, []);

  /** Re-fetch the roster immediately after an import. */
  const refreshStudents = useCallback(async () => {
    setStudents(await loadStudents());
  }, []);

  return {
    election,
    positions,
    candidates,
    voters,
    students,
    results,
    auditEntries,
    loading,
    errorMessage,
    refreshCandidates,
    refreshStudents,
    refreshResults,
  };
}
