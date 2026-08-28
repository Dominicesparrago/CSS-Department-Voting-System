import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';

/**
 * Election lifecycle (superadmin). Status/registration changes remain direct
 * Firestore writes (adminData.setElectionStatus / setRegistrationOpen); the
 * create/update/archive/restore/lock/unlock operations below run through
 * trusted callables because they enforce the lock/finalize guard server-side
 * and audit every change.
 */

interface ElectionCreateInput {
  id?: string;
  title: string;
  positions?: string[];
  eligibleSections?: string[];
  openAt?: unknown;
  closeAt?: unknown;
  metadata?: Record<string, string>;
}

/** Create a new draft election. Returns the generated election id. */
export function createElection(input: ElectionCreateInput): Promise<{ ok: boolean; id: string }> {
  const call = httpsCallable<ElectionCreateInput, { ok: boolean; id: string }>(
    getFirebaseFunctions(),
    'createElection',
  );
  return call(input).then(({ data }) => data);
}

export interface ElectionUpdateInput {
  electionId: string;
  title?: string;
  positions?: string[];
  eligibleSections?: string[];
  openAt?: unknown;
  closeAt?: unknown;
  metadata?: Record<string, string>;
  /** Superadmin emergency override for a finalized election (audited). */
  force?: boolean;
}

/** Update an existing election's configurable fields. */
export function updateElection(input: ElectionUpdateInput): Promise<{ ok: boolean }> {
  const call = httpsCallable<ElectionUpdateInput, { ok: boolean }>(
    getFirebaseFunctions(),
    'updateElection',
  );
  return call(input).then(({ data }) => data);
}

export function archiveElection(electionId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'archiveElection',
  );
  return call({ electionId }).then(({ data }) => data);
}

export function restoreElection(electionId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'restoreElection',
  );
  return call({ electionId }).then(({ data }) => data);
}

export interface ResetAllElectionDataResult {
  ok: boolean;
  electionId: string;
  backupId?: string;
  deleted: {
    candidates: number;
    ballots: number;
    voters: number;
    students: number;
    studentIndexes: number;
    emailIndexes: number;
    tallies: number;
    authUsers: number;
  };
}

/** Requires `backupId` from a fresh 'pre-reset-full' backup (server-verified). */
export function resetAllElectionData(params: {
  electionId: string;
  confirmation: string;
  backupId: string;
}): Promise<ResetAllElectionDataResult> {
  const call = httpsCallable<
    { electionId: string; confirmation: string; backupId: string },
    ResetAllElectionDataResult
  >(getFirebaseFunctions(), 'resetAllElectionData');
  return call(params).then(({ data }) => data);
}

/** Lock an election: blocks ordinary admin edits and new votes until unlocked. */
export function lockElection(electionId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'lockElection',
  );
  return call({ electionId }).then(({ data }) => data);
}

export function unlockElection(electionId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'unlockElection',
  );
  return call({ electionId }).then(({ data }) => data);
}

/** Allow profile-only candidate edits while preserving ballots and tallies. */
export function unlockCandidateProfiles(electionId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ electionId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'unlockCandidateProfiles',
  );
  return call({ electionId }).then(({ data }) => data);
}
