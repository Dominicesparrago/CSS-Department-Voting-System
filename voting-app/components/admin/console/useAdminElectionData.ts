'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadCandidates,
  loadElection,
  loadPositions,
  loadResults,
  loadVoters,
  watchAudit,
  watchCandidates,
  watchElection,
  watchVoters,
} from '@/lib/admin/adminData';
import type { ResultsCounts } from '@/lib/admin/adminCore';
import type { AuditEntry, Candidate, Election, Position, Voter } from '@/lib/types';

const EMPTY_RESULTS: ResultsCounts = { perCandidate: {}, perPosition: {} };
const RESULTS_POLL_MS = 15000;

/**
 * Loads the full admin dataset once, then keeps election/candidates/voters/audit
 * live through Firestore subscriptions. Vote counts come from the trusted
 * getResults function (raw ballots are never client-readable) and are polled on
 * an interval plus refreshable on demand after lifecycle changes.
 */
export function useAdminElectionData(enabled: boolean) {
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [results, setResults] = useState<ResultsCounts>(EMPTY_RESULTS);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const activeRef = useRef(false);

  const refreshResults = useCallback(async () => {
    try {
      const next = await loadResults();
      if (activeRef.current) setResults(next);
    } catch {
      // A results fetch failure leaves the last known counts in place; turnout
      // (from the voter registry) still updates live, so the console stays usable.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    const unsubscribers: (() => void)[] = [];

    async function load() {
      try {
        const [nextElection, nextPositions, nextCandidates, nextVoters] = await Promise.all([
          loadElection(),
          loadPositions(),
          loadCandidates(),
          loadVoters(),
        ]);
        if (!activeRef.current) return;

        setElection(nextElection);
        setPositions(nextPositions);
        setCandidates(nextCandidates);
        setVoters(nextVoters);
        setErrorMessage('');

        unsubscribers.push(
          watchCandidates(setCandidates, (error) => setErrorMessage(error.message)),
          watchVoters(setVoters, (error) => setErrorMessage(error.message)),
          watchElection(setElection, (error) => setErrorMessage(error.message)),
          watchAudit(setAuditEntries, (error) => setErrorMessage(error.message)),
        );
        await refreshResults();
      } catch (error) {
        if (activeRef.current) setErrorMessage((error as Error).message);
      } finally {
        if (activeRef.current) setLoading(false);
      }
    }

    void load();
    const poll = setInterval(() => void refreshResults(), RESULTS_POLL_MS);
    return () => {
      activeRef.current = false;
      clearInterval(poll);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [enabled, refreshResults]);

  /** Re-fetch candidates immediately after a mutation instead of waiting on the snapshot. */
  const refreshCandidates = useCallback(async () => {
    setCandidates(await loadCandidates());
  }, []);

  return {
    election,
    positions,
    candidates,
    voters,
    results,
    auditEntries,
    loading,
    errorMessage,
    refreshCandidates,
    refreshResults,
  };
}
