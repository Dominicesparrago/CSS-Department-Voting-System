import { httpsCallable } from 'firebase/functions';
import type { User } from 'firebase/auth';
import { getFirebaseFunctions } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { Election, Position, VoterProfile, Selections } from '../types';
import { isBallotComplete } from './ballotState';

/**
 * Cast a complete ballot through the trusted `submitBallot` Cloud Function.
 * The client checks are only for fast UX feedback — the function re-validates
 * eligibility, election status, ballot completeness, and one-vote authoritatively,
 * and writes anonymous ballots + the participation lock in a single transaction.
 */
export async function submitCompleteBallot(params: {
  user: User;
  voterProfile: VoterProfile;
  election: Election;
  requiredPositions: Position[];
  selections: Selections;
}): Promise<void> {
  const { election, requiredPositions, selections } = params;

  if (election.status !== 'open') throw new Error('Voting is not open for this election.');
  if (!isBallotComplete(requiredPositions, selections)) throw new Error('Complete every race before submitting.');

  const submit = httpsCallable<{ electionId: string; selections: Selections }, { ok: boolean }>(
    getFirebaseFunctions(),
    'submitBallot',
  );

  try {
    await submit({ electionId: election.id || ELECTION_ID, selections });
  } catch (error) {
    // Callable errors carry a human-readable message set by the function.
    throw new Error((error as { message?: string }).message || 'Unable to submit your ballot.');
  }
}
