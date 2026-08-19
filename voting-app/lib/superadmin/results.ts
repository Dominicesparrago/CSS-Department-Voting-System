import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';

/**
 * Result verification & finalization (superadmin). Verification runs the
 * read-only checklist; finalization recomputes the tally from immutable
 * ballots, seals the results, and flags the election as finalized.
 */

export interface VerifyResult {
  ok: boolean;
  checks: Array<{ code: string; status: 'ok' | 'warn' | 'error'; message: string }>;
}

export function verifyResults(electionId: string): Promise<VerifyResult> {
  const call = httpsCallable<{ electionId: string }, VerifyResult>(
    getFirebaseFunctions(),
    'verifyResults',
  );
  return call({ electionId }).then(({ data }) => data);
}

export function finalizeElection(electionId: string): Promise<{ ok: boolean; turnout: number }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean; turnout: number }>(
    getFirebaseFunctions(),
    'finalizeElection',
  );
  return call({ electionId }).then(({ data }) => data);
}