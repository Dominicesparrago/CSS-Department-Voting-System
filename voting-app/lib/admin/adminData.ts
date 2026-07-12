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
 */
export async function loadResults(electionId = ELECTION_ID): Promise<ResultsCounts> {
  const call = httpsCallable<{ electionId: string }, ResultsCounts & { ballotCount: number }>(
    getFirebaseFunctions(),
    'getResults',
  );
  const { data } = await call({ electionId });
  return { perCandidate: data.perCandidate ?? {}, perPosition: data.perPosition ?? {} };
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
}): Promise<string> {
  const db = getFirebaseDb();
  const { candidate, photoFile, actorUid } = params;
  const photoError = validateCandidatePhoto(photoFile ?? null);
  if (photoError) throw new Error(photoError);

  const candidateRef = candidate.id
    ? doc(db, 'candidates', candidate.id)
    : doc(collection(db, 'candidates'));

  const photoFields = photoFile ? await uploadCandidatePhoto(candidateRef.id, photoFile) : {};

  const payload = {
    electionId: ELECTION_ID,
    positionId: candidate.positionId,
    name: candidate.name.trim(),
    section: candidate.section.trim(),
    yearLevel: Number(candidate.yearLevel),
    platform: candidate.platform.trim(),
    goals: candidate.goals?.trim() || null,
    bio: candidate.bio?.trim() || null,
    party: candidate.party?.trim() || null,
    order: Number(candidate.order),
    active: candidate.active === true,
    ...photoFields,
    updatedAt: serverTimestamp(),
  };

  if (candidate.id) {
    await updateDoc(candidateRef, payload);
    await createAudit(actorUid, 'candidate.update', `candidates/${candidateRef.id}`, {
      positionId: payload.positionId,
      active: payload.active,
    });
  } else {
    await setDoc(candidateRef, { ...payload, photoURL: (payload as { photoURL?: string }).photoURL ?? '', photoPath: (payload as { photoPath?: string }).photoPath ?? '', createdAt: serverTimestamp() });
    await createAudit(actorUid, 'candidate.create', `candidates/${candidateRef.id}`, {
      positionId: payload.positionId,
    });
  }

  return candidateRef.id;
}

export async function setCandidateActive(candidateId: string, active: boolean, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'candidates', candidateId), { active, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'candidate.active.set', `candidates/${candidateId}`, { active });
}

export async function deleteCandidate(candidateId: string, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, 'candidates', candidateId));
  const photoPath = snapshot.exists() ? (snapshot.data() as { photoPath?: string }).photoPath : '';
  await deleteDoc(doc(db, 'candidates', candidateId));
  if (photoPath) {
    try {
      await deleteObject(ref(getFirebaseStorage(), photoPath));
    } catch {
      // photo cleanup is best-effort; the record delete is what matters
    }
  }
  await createAudit(actorUid, 'candidate.delete', `candidates/${candidateId}`, {});
}

export async function setVoterEligibility(uid: string, eligible: boolean, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'voters', uid), { eligible, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'voter.eligible.set', `voters/${uid}`, { eligible });
}

export async function setElectionStatus(status: string, actorUid: string, electionId = ELECTION_ID): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'elections', electionId), { status, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'election.status.set', `elections/${electionId}`, { status });
}

export async function setRegistrationOpen(registrationOpen: boolean, actorUid: string, electionId = ELECTION_ID): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, 'elections', electionId), { registrationOpen, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'election.registration.set', `elections/${electionId}`, { registrationOpen });
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
