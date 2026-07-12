'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  loadCandidates,
  loadElection,
  loadPositions,
  loadVoters,
  watchAudit,
  watchCandidates,
  watchElection,
  watchVoters,
  watchVotes,
} from '@/lib/admin/adminData';
import type { AuditEntry, Candidate, Election, Position, Vote, Voter } from '@/lib/types';

/**
 * Loads the full admin dataset once, then keeps it live through Firestore
 * subscriptions. Subscriptions attach only after the initial load so the first
 * paint is consistent; everything tears down when `enabled` flips or on unmount.
 */
export function useAdminElectionData(enabled: boolean) {
  const [election, setElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const unsubscribers: (() => void)[] = [];

    async function load() {
      try {
        const [nextElection, nextPositions, nextCandidates, nextVoters] = await Promise.all([
          loadElection(),
          loadPositions(),
          loadCandidates(),
          loadVoters(),
        ]);
        if (!active) return;

        setElection(nextElection);
        setPositions(nextPositions);
        setCandidates(nextCandidates);
        setVoters(nextVoters);
        setErrorMessage('');

        unsubscribers.push(
          watchCandidates(setCandidates, (error) => setErrorMessage(error.message)),
          watchVoters(setVoters, (error) => setErrorMessage(error.message)),
          watchVotes(setVotes, (error) => setErrorMessage(error.message)),
          watchElection(setElection, (error) => setErrorMessage(error.message)),
          watchAudit(setAuditEntries, (error) => setErrorMessage(error.message)),
        );
      } catch (error) {
        if (active) setErrorMessage((error as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [enabled]);

  /** Re-fetch candidates immediately after a mutation instead of waiting on the snapshot. */
  const refreshCandidates = useCallback(async () => {
    setCandidates(await loadCandidates());
  }, []);

  return { election, positions, candidates, voters, votes, auditEntries, loading, errorMessage, refreshCandidates };
}
