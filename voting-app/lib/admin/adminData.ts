import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase/init';
import { ELECTION_ID } from '../constants';
import type { Candidate, Election, Position, Vote, Voter } from '../types';
import { buildTallies } from './adminCore';

const MAX_CANDIDATE_IMAGE_BYTES = 2 * 1024 * 1024;

function snapshotRecords<T>(snapshot: import('firebase/firestore').QuerySnapshot): (T & { id: string })[] {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string });
}

export async function loadElection(electionId = ELECTION_ID): Promise<Election> {
  const snapshot = await getDoc(doc(db, 'elections', electionId));
  if (!snapshot.exists()) throw new Error('Election was not found.');
  return { id: snapshot.id, ...(snapshot.data() as Omit<Election, 'id'>) };
}

export async function loadPositions(): Promise<Position[]> {
  const snapshot = await getDocs(query(collection(db, 'positions'), orderBy('order', 'asc')));
  return snapshotRecords<Position>(snapshot);
}

export async function loadCandidates(): Promise<Candidate[]> {
  const snapshot = await getDocs(query(collection(db, 'candidates'), orderBy('order', 'asc')));
  return snapshotRecords<Candidate>(snapshot);
}

export async function loadVoters(): Promise<Voter[]> {
  const snapshot = await getDocs(query(collection(db, 'voters'), orderBy('fullName', 'asc')));
  return snapshotRecords<Voter>(snapshot);
}

export async function loadVotes(): Promise<Vote[]> {
  const snapshot = await getDocs(query(collection(db, 'votes'), orderBy('createdAt', 'asc')));
  return snapshotRecords<Vote>(snapshot);
}

export function watchVotes(onChange: (votes: Vote[]) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'votes'), orderBy('createdAt', 'asc')),
    (snapshot) => onChange(snapshotRecords<Vote>(snapshot)),
    onError,
  );
}

export function watchElection(
  onChange: (election: Election) => void,
  onError: (e: Error) => void,
  electionId = ELECTION_ID,
): () => void {
  return onSnapshot(
    doc(db, 'elections', electionId),
    (snapshot) => {
      if (snapshot.exists()) onChange({ id: snapshot.id, ...(snapshot.data() as Omit<Election, 'id'>) });
    },
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
  await updateDoc(doc(db, 'candidates', candidateId), { active, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'candidate.active.set', `candidates/${candidateId}`, { active });
}

export async function setVoterEligibility(uid: string, eligible: boolean, actorUid: string): Promise<void> {
  await updateDoc(doc(db, 'voters', uid), { eligible, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'voter.eligible.set', `voters/${uid}`, { eligible });
}

export async function setElectionStatus(status: string, actorUid: string, electionId = ELECTION_ID): Promise<void> {
  await updateDoc(doc(db, 'elections', electionId), { status, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'election.status.set', `elections/${electionId}`, { status });
}

export async function publishElection(params: { actorUid: string; electionId?: string }) {
  const { actorUid, electionId = ELECTION_ID } = params;
  const electionSnapshot = await getDoc(doc(db, 'elections', electionId));
  const election = electionSnapshot.exists() ? electionSnapshot.data() : null;
  if (election?.status !== 'closed') throw new Error('Close the election before publishing results.');

  const freshVotes = await loadVotes();
  const tallies = buildTallies(electionId, freshVotes);

  await setDoc(doc(db, 'tallies', electionId), { ...tallies, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'elections', electionId), { status: 'published', updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'election.publish', `elections/${electionId}`, {
    voteDocs: freshVotes.filter((v) => v.electionId === electionId).length,
    turnout: tallies.turnout.total,
  });

  return tallies;
}

export async function createAudit(actorUid: string, action: string, target: string, details: Record<string, unknown> = {}) {
  await addDoc(collection(db, 'audit'), {
    ts: serverTimestamp(),
    actorUid,
    actorRole: 'admin',
    action,
    target,
    details,
  });
}
