import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { Candidate, Election, Position } from '../types';
import { requiredPositionsForVoter } from './ballotState';

export async function loadElection(electionId = ELECTION_ID): Promise<Election> {
  const snapshot = await getDoc(doc(db, 'elections', electionId));
  if (!snapshot.exists()) throw new Error('Election was not found.');
  return { id: snapshot.id, ...(snapshot.data() as Omit<Election, 'id'>) };
}

export async function loadRequiredPositions(yearLevel: number): Promise<Position[]> {
  const snapshot = await getDocs(query(collection(db, 'positions'), orderBy('order', 'asc')));
  const positions = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Position, 'id'>) }));
  return requiredPositionsForVoter(positions, yearLevel);
}

export async function loadCandidatesForPositions(
  positions: Position[],
  electionId = ELECTION_ID,
): Promise<Record<string, Candidate[]>> {
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
      return [
        position.id,
        snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Candidate, 'id'>) })),
      ] as [string, Candidate[]];
    }),
  );
  return Object.fromEntries(entries);
}
