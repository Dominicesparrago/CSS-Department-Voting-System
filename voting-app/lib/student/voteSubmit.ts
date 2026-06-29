import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { Election, Position, VoterProfile, Selections } from '../types';
import { isBallotComplete } from './ballotState';

export function voteDocId(electionId: string, uid: string, positionId: string): string {
  return `${electionId}__${uid}__${positionId}`;
}

export async function submitCompleteBallot(params: {
  user: User;
  voterProfile: VoterProfile;
  election: Election;
  requiredPositions: Position[];
  selections: Selections;
}): Promise<void> {
  const { user, voterProfile, election, requiredPositions, selections } = params;

  if (election.status !== 'open') throw new Error('Voting is not open for this election.');
  if (!isBallotComplete(requiredPositions, selections)) throw new Error('Complete every race before submitting.');

  const batch = writeBatch(db);
  const createdAt = serverTimestamp();
  const eid = election.id || ELECTION_ID;

  requiredPositions.forEach((position) => {
    batch.set(doc(db, 'votes', voteDocId(eid, user.uid, position.id)), {
      electionId: eid,
      uid: user.uid,
      positionId: position.id,
      candidateId: selections[position.id],
      yearLevel: voterProfile.yearLevel,
      createdAt,
    });
  });

  batch.update(doc(db, 'voters', user.uid), {
    [`hasVoted.${eid}`]: true,
    [`votedAt.${eid}`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}
