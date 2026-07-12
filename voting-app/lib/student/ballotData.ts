import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import { loadScopedPositions } from '../election/electionRepo';
import { ELECTION_ID } from '../constants';
import type { Candidate, Position } from '../types';
import { requiredPositionsForVoter } from './ballotState';

export { loadElection } from '../election/electionRepo';

export async function loadRequiredPositions(yearLevel: number, electionId = ELECTION_ID): Promise<Position[]> {
  const positions = await loadScopedPositions(electionId);
  return requiredPositionsForVoter(positions, yearLevel);
}

export async function loadCandidatesForPositions(
  positions: Position[],
  electionId = ELECTION_ID,
): Promise<Record<string, Candidate[]>> {
  const db = getFirebaseDb();
  const entries = await Promise.all(
    positions.map(async (position) => {
      const snapshot = await getDocs(
        query(
          collection(db, 'candidates'),
          where('electionId', '==', electionId),
          where('positionId', '==', position.id),
          where('active', '==', true),
          orderBy('order', 'asc'),
        ),
      );
      return [position.id, snapshotRecords<Candidate>(snapshot)] as [string, Candidate[]];
    }),
  );
  return Object.fromEntries(entries);
}
