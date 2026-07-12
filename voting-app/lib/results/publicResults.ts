import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/init';
import { ELECTION_ID } from '../constants';

export {
  loadElection as loadPublicElection,
  loadScopedPositions as loadPublicPositions,
  loadCandidates as loadPublicCandidates,
} from '../election/electionRepo';

export interface PublishedTally {
  perCandidate: Record<string, number>;
  perPosition: Record<string, number>;
  turnout: {
    total: number;
    byYear: Record<string, number>;
  };
  updatedAt?: unknown;
}

export async function loadPublishedTally(electionId = ELECTION_ID): Promise<PublishedTally | null> {
  const db = getFirebaseDb();
  try {
    const snapshot = await getDoc(doc(db, 'tallies', electionId));
    if (!snapshot.exists()) return null;
    return snapshot.data() as PublishedTally;
  } catch (error) {
    // security rules deny tally reads until the election is published;
    // that is the "not published yet" state, not a load failure
    if ((error as { code?: string }).code === 'permission-denied') return null;
    throw error;
  }
}
