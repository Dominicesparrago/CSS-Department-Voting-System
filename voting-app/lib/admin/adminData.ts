import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions, getFirebaseStorage } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import { friendlyAdminError } from './adminErrors';
import { ELECTION_ID } from '../constants';
import type { AuditEntry, Candidate, Voter } from '../types';
import type { ResultsCounts } from './adminCore';

export { loadElection, loadCandidates, watchElection, loadScopedPositions as loadPositions } from '../election/electionRepo';

const MAX_CANDIDATE_IMAGE_BYTES = 2 * 1024 * 1024;

export async function loadVoters(): Promise<Voter[]> {
  const db = getFirebaseDb();
  const snapshot = await getDocs(query(collection(db, 'voters'), orderBy('fullName', 'asc')));
  return snapshotRecords<Voter>(snapshot);
}

/**
 * Aggregate vote counts from the trusted getResults function. Raw ballots are
 * never readable by the client — the server returns only per-candidate and
 * per-position totals, so no ballot can be traced to a voter.
 *
 * Counts are computed server-side from immutable ballots on every call; there
 * is no live tally document to subscribe to. Call this (via refreshResults)
 * whenever fresh numbers are wanted.
 */
export async function loadResults(electionId = ELECTION_ID): Promise<ResultsCounts & { ballotCount: number }> {
  const call = httpsCallable<{ electionId: string }, ResultsCounts & { ballotCount: number }>(
    getFirebaseFunctions(),
    'getResults',
  );
  const { data } = await call({ electionId });
  return {
    perCandidate: data.perCandidate ?? {},
    perPosition: data.perPosition ?? {},
    ballotCount: data.ballotCount ?? 0,
  };
}

export function watchCandidates(
  onChange: (candidates: Candidate[]) => void,
  onError: (e: Error) => void,
  electionId = ELECTION_ID,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(
      collection(db, 'candidates'),
      where('electionId', '==', electionId),
      orderBy('order', 'asc'),
    ),
    (snapshot) => onChange(snapshotRecords<Candidate>(snapshot)),
    onError,
  );
}

export function watchVoters(
  onChange: (voters: Voter[]) => void,
  onError: (e: Error) => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, 'voters'), orderBy('fullName', 'asc')),
    (snapshot) => onChange(snapshotRecords<Voter>(snapshot)),
    onError,
  );
}

export function validateCandidatePhoto(file: File | null | undefined): string {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return 'Upload an image file.';
  if (file.size > MAX_CANDIDATE_IMAGE_BYTES) return 'Image must be 2MB or smaller.';
  return '';
}

async function uploadCandidatePhoto(candidateId: string, file: File) {
  const storage = getFirebaseStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const photoPath = `candidates/${candidateId}-${Date.now()}-${safeName}`;
  const photoRef = ref(storage, photoPath);
  await uploadBytes(photoRef, file, { contentType: file.type });
  return { photoPath, photoURL: await getDownloadURL(photoRef) };
}

interface CandidateInput {
  id?: string;
  positionId: string;
  name: string;
  section: string;
  yearLevel: number;
  platform: string;
  goals?: string;
  bio?: string;
  party?: string;
  order: number;
  active: boolean;
}

export async function saveCandidate(params: {
  candidate: CandidateInput;
  photoFile?: File | null;
  actorUid: string;
  electionId?: string;
}): Promise<string> {
  const { candidate, photoFile } = params;
  const electionId = params.electionId ?? ELECTION_ID;
  const photoError = validateCandidatePhoto(photoFile ?? null);
  if (photoError) throw new Error(photoError);

  // Generate a client id for the Storage path when creating; the callable
  // will create the document with this id or with the provided one.
  const provisionalId = candidate.id || `cand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const photoFields = photoFile ? await uploadCandidatePhoto(provisionalId, photoFile) : {};

  const call = httpsCallable<
    CandidateInput & { electionId?: string; photoURL?: string; photoPath?: string },
    { ok: boolean; id: string }
  >(getFirebaseFunctions(), 'upsertCandidate');
  try {
    const { data } = await call({
      id: candidate.id,
      electionId,
      positionId: candidate.positionId,
      name: candidate.name,
      section: candidate.section,
      yearLevel: candidate.yearLevel,
      platform: candidate.platform,
      goals: candidate.goals,
      bio: candidate.bio,
      party: candidate.party,
      order: candidate.order,
      active: candidate.active,
      photoURL: (photoFields as { photoURL?: string }).photoURL,
      photoPath: (photoFields as { photoPath?: string }).photoPath,
    });
    return data.id;
  } catch (error) {
    // Best-effort cleanup of an orphaned upload when the callable rejects
    // (e.g., candidates frozen after voting started).
    if ((photoFields as { photoPath?: string }).photoPath) {
      try {
        await deleteObject(ref(getFirebaseStorage(), (photoFields as { photoPath: string }).photoPath));
      } catch {}
    }
    throw new Error(friendlyAdminError(error, 'Unable to save the candidate.'));
  }
}

export async function setCandidateActive(candidateId: string, active: boolean, _actorUid: string): Promise<void> {
  const call = httpsCallable<{ candidateId: string; active: boolean }, { ok: boolean }>(
    getFirebaseFunctions(),
    'setCandidateActive',
  );
  try {
    await call({ candidateId, active });
  } catch (error) {
    throw new Error(friendlyAdminError(error, 'Unable to change the candidate status.'));
  }
}

export async function setCandidateArchived(candidateId: string, archived: boolean, _actorUid: string): Promise<void> {
  const call = httpsCallable<{ candidateId: string; archived: boolean }, { ok: boolean }>(
    getFirebaseFunctions(),
    'setCandidateArchived',
  );
  try {
    await call({ candidateId, archived });
  } catch (error) {
    throw new Error(friendlyAdminError(error, 'Unable to archive the candidate.'));
  }
}

export async function deleteCandidate(candidateId: string, _actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, 'candidates', candidateId));
  const photoPath = snapshot.exists() ? (snapshot.data() as { photoPath?: string }).photoPath : '';
  const call = httpsCallable<{ candidateId: string }, { ok: boolean }>(getFirebaseFunctions(), 'deleteCandidate');
  try {
    await call({ candidateId });
  } catch (error) {
    throw new Error(friendlyAdminError(error, 'Unable to delete the candidate.'));
  }
  if (photoPath) {
    try {
      await deleteObject(ref(getFirebaseStorage(), photoPath));
    } catch {
      // photo cleanup is best-effort; the record delete is what matters
    }
  }
}

export async function setVoterEligibility(uid: string, eligible: boolean, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'voters', uid), { eligible, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'voter.eligible.set', `voters/${uid}`, { eligible });
}

/**
 * Election status changes run through the trusted setElectionStatus callable,
 * which enforces the lifecycle state machine (draft→open→closed; reopening a
 * closed election requires superadmin force) and writes the server-side audit
 * entry. Clients can no longer write election documents directly.
 */
export async function setElectionStatus(
  status: string,
  actorUid: string,
  electionId = ELECTION_ID,
  force = false,
): Promise<void> {
  const call = httpsCallable<
    { electionId: string; status: string; force: boolean },
    { ok: boolean }
  >(getFirebaseFunctions(), 'setElectionStatus');
  try {
    await call({ electionId, status, force });
  } catch (error) {
    throw new Error(friendlyAdminError(error, 'Unable to change the election status.'));
  }
}

/** Registration toggle via the trusted setRegistrationOpen callable (audited server-side). */
export async function setRegistrationOpen(registrationOpen: boolean, actorUid: string, electionId = ELECTION_ID): Promise<void> {
  const call = httpsCallable<
    { electionId: string; registrationOpen: boolean },
    { ok: boolean }
  >(getFirebaseFunctions(), 'setRegistrationOpen');
  try {
    await call({ electionId, registrationOpen });
  } catch (error) {
    throw new Error(friendlyAdminError(error, 'Unable to change registration.'));
  }
}

/**
 * Publish official results through the trusted publishTally function, which
 * recomputes the tally from immutable ballots server-side and flips the election
 * to published. The audit entry is written client-side after the callable
 * succeeds so it carries the acting admin's uid.
 */
export async function publishElection(params: { actorUid: string; electionId?: string }) {
  const { actorUid, electionId = ELECTION_ID } = params;
  const call = httpsCallable<{ electionId: string }, { ok: boolean; turnout: number }>(
    getFirebaseFunctions(),
    'publishTally',
  );

  let turnout = 0;
  try {
    const { data } = await call({ electionId });
    turnout = data.turnout ?? 0;
  } catch (error) {
    throw new Error((error as { message?: string }).message || 'Unable to publish results.');
  }

  await createAudit(actorUid, 'election.publish', `elections/${electionId}`, { turnout });
  return { turnout };
}

export async function createAudit(
  actorUid: string,
  action: string,
  target: string,
  details: Record<string, unknown> = {},
  actorRole: 'admin' | 'superadmin' = 'admin',
) {
  const db = getFirebaseDb();
  await addDoc(collection(db, 'audit'), {
    ts: serverTimestamp(),
    actorUid,
    actorRole,
    action,
    target,
    details,
  });
}

export function watchAudit(
  onChange: (entries: AuditEntry[]) => void,
  onError: (e: Error) => void,
  max = 20,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, 'audit'), orderBy('ts', 'desc'), limit(max)),
    (snapshot) => onChange(snapshotRecords<AuditEntry>(snapshot)),
    onError,
  );
}
