import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import { createAudit } from '../admin/adminData';
import { ELECTION_ID } from '../constants';
import type { AdminEntry, AppConfig, Election } from '../types';

/**
 * Superadmin-only operations. Admin access below superadmin lives in the
 * admins/{email} registry so it can be granted and revoked at runtime without
 * the Admin SDK; superadmin itself is a custom claim set by
 * firebase/rules-tests/set-superadmin.mjs.
 */

export function watchAdmins(onChange: (admins: AdminEntry[]) => void, onError: (e: Error) => void): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, 'admins'), orderBy('createdAt', 'asc')),
    (snapshot) => onChange(snapshotRecords<AdminEntry>(snapshot)),
    onError,
  );
}

export async function grantAdmin(params: { email: string; reason: string; actorUid: string }): Promise<void> {
  const db = getFirebaseDb();
  const email = params.email.trim().toLowerCase();
  const reason = params.reason.trim();
  await setDoc(doc(db, 'admins', email), {
    email,
    role: 'admin',
    addedBy: params.actorUid,
    reason,
    createdAt: serverTimestamp(),
  });
  await createAudit(params.actorUid, 'admin.grant', `admins/${email}`, { email, reason }, 'superadmin');
}

export async function createAdminAccount(params: { email: string; password: string }): Promise<{ email: string; uid: string }> {
  const call = httpsCallable<{ email: string; password: string }, { ok: boolean; email: string; uid: string }>(
    getFirebaseFunctions(),
    'createAdminAccount',
  );
  const { data } = await call({ email: params.email.trim().toLowerCase(), password: params.password });
  return { email: data.email, uid: data.uid };
}

export async function revokeAdmin(params: { email: string; reason: string; actorUid: string }): Promise<void> {
  const db = getFirebaseDb();
  const email = params.email.trim().toLowerCase();
  await deleteDoc(doc(db, 'admins', email));
  await createAudit(params.actorUid, 'admin.revoke', `admins/${email}`, { email, reason: params.reason.trim() }, 'superadmin');
}

export function watchAllElections(onChange: (elections: Election[]) => void, onError: (e: Error) => void): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    collection(db, 'elections'),
    (snapshot) => onChange(snapshotRecords<Election>(snapshot)),
    onError,
  );
}

export async function updateElectionTitle(electionId: string, title: string, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  const trimmed = title.trim();
  await updateDoc(doc(db, 'elections', electionId), { title: trimmed, updatedAt: serverTimestamp() });
  await createAudit(actorUid, 'election.title.set', `elections/${electionId}`, { title: trimmed }, 'superadmin');
}

export async function saveAppConfig(config: Pick<AppConfig, 'allowGuestVoters' | 'maintenanceMode'>, actorUid: string): Promise<void> {
  const db = getFirebaseDb();
  await setDoc(doc(db, 'config', 'app'), {
    allowGuestVoters: config.allowGuestVoters,
    maintenanceMode: config.maintenanceMode,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  });
  await createAudit(actorUid, 'config.set', 'config/app', { ...config }, 'superadmin');
}

/**
 * Exception handling for a bricked one-time registration. Deletes the voter
 * record and its student-number/email index entries so the same credentials can
 * be registered again (e.g. a typo'd student number or email). Refuses voters
 * who have already cast a ballot — their participation lock lives on this doc,
 * and deleting it would let the same person vote twice.
 */
export async function resetVoterRegistration(params: { uid: string; reason: string; actorUid: string }): Promise<void> {
  const db = getFirebaseDb();
  const voterRef = doc(db, 'voters', params.uid);
  const snapshot = await getDoc(voterRef);
  if (!snapshot.exists()) throw new Error('Voter record not found.');
  const voter = snapshot.data() as {
    studentNo?: string;
    email?: string;
    fullName?: string;
    hasVoted?: Record<string, boolean>;
  };

  if (voter.hasVoted?.[ELECTION_ID] === true) {
    throw new Error('This voter has already cast a ballot — their registration cannot be reset.');
  }

  const email = voter.email?.trim().toLowerCase();
  await Promise.all([
    deleteDoc(voterRef),
    voter.studentNo ? deleteDoc(doc(db, 'studentIndex', voter.studentNo)) : Promise.resolve(),
    email ? deleteDoc(doc(db, 'emailIndex', email)) : Promise.resolve(),
  ]);

  await createAudit(
    params.actorUid,
    'voter.reset',
    `voters/${params.uid}`,
    {
      fullName: voter.fullName ?? '',
      studentNo: voter.studentNo ?? '',
      email: voter.email ?? '',
      reason: params.reason.trim(),
    },
    'superadmin',
  );
}
