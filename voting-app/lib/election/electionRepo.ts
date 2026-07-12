import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import { ELECTION_ID } from '../constants';
import type { Candidate, Election, Position } from '../types';

/**
 * Read-side access to the election, its positions, and candidates.
 * Shared by the admin console, the student ballot, and the public results page;
 * role-specific repos (adminData, ballotData, publicResults) build on these.
 */

export async function loadElection(electionId = ELECTION_ID): Promise<Election> {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, 'elections', electionId));
  if (!snapshot.exists()) throw new Error('Election was not found.');
  return { id: snapshot.id, ...(snapshot.data() as Omit<Election, 'id'>) };
}

export function watchElection(
  onChange: (election: Election) => void,
  onError: (e: Error) => void,
  electionId = ELECTION_ID,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    doc(db, 'elections', electionId),
    (snapshot) => {
      if (snapshot.exists()) onChange({ id: snapshot.id, ...(snapshot.data() as Omit<Election, 'id'>) });
    },
    onError,
  );
}

function scopeToElection(positions: Position[], election: Election): Position[] {
  const scopedIds = election.positions;
  if (!scopedIds?.length) return positions;
  const allowed = new Set(scopedIds);
  return positions.filter((position) => allowed.has(position.id));
}

/** All positions on this election's ballot, in ballot order. */
export async function loadScopedPositions(electionId = ELECTION_ID): Promise<Position[]> {
  const db = getFirebaseDb();
  const [election, snapshot] = await Promise.all([
    loadElection(electionId),
    getDocs(query(collection(db, 'positions'), orderBy('order', 'asc'))),
  ]);
  return scopeToElection(snapshotRecords<Position>(snapshot), election);
}

export async function loadCandidates(electionId = ELECTION_ID): Promise<Candidate[]> {
  const db = getFirebaseDb();
  const snapshot = await getDocs(query(
    collection(db, 'candidates'),
    where('electionId', '==', electionId),
    orderBy('order', 'asc'),
  ));
  return snapshotRecords<Candidate>(snapshot);
}
