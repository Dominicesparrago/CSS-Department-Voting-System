import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import { ELECTION_ID } from '../constants';
import type { RosterImportRow, RosterImportSummary, RosterStudent } from '../types';

/**
 * Read-side access to the official roster (`students/{studentNo}`). Roster
 * documents are written only by the importRoster Cloud Function; admins can
 * read the whole collection and students can read their own record.
 */

export async function loadStudents(): Promise<RosterStudent[]> {
  const db = getFirebaseDb();
  const snapshot = await getDocs(query(collection(db, 'students'), orderBy('fullName', 'asc')));
  return snapshotRecords<RosterStudent>(snapshot);
}

export function watchStudents(
  onChange: (students: RosterStudent[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, 'students'), orderBy('fullName', 'asc')),
    (snapshot) => onChange(snapshotRecords<RosterStudent>(snapshot)),
    onError,
  );
}

/**
 * Send parsed roster rows to the trusted importRoster function, which
 * re-validates every row, upserts `students/{studentNo}`, and returns the
 * authoritative import summary. `replace` soft-deactivates roster students
 * absent from the file.
 */
export async function importRosterRows(params: {
  rows: RosterImportRow[];
  replace: boolean;
}): Promise<RosterImportSummary> {
  const call = httpsCallable<{ rows: RosterImportRow[]; replace: boolean }, { ok: boolean; summary: RosterImportSummary }>(
    getFirebaseFunctions(),
    'importRoster',
  );
  try {
    const { data } = await call({ rows: params.rows, replace: params.replace });
    return data.summary;
  } catch (error) {
    throw new Error((error as { message?: string }).message || 'Unable to import the roster.');
  }
}

/**
 * Remove specific roster entries by document id (student number for ID-keyed
 * rows, the auto document id for masterlist rows). Admin-only, enforced by the
 * deleteRosterEntries Cloud Function. Removal is permanent: the student can no
 * longer vote.
 */
export async function removeRosterStudents(ids: string[]): Promise<number> {
  const call = httpsCallable<{ ids: string[] }, { ok: boolean; deleted: number }>(
    getFirebaseFunctions(),
    'deleteRosterEntries',
  );
  try {
    const { data } = await call({ ids });
    return data.deleted;
  } catch (error) {
    throw new Error((error as { message?: string }).message || 'Unable to remove the selected students.');
  }
}

/** Remove every roster entry. Admin-only, enforced by the deleteRosterEntries Cloud Function. */
export async function removeAllRosterStudents(): Promise<number> {
  const call = httpsCallable<{ all: true }, { ok: boolean; deleted: number }>(
    getFirebaseFunctions(),
    'deleteRosterEntries',
  );
  try {
    const { data } = await call({ all: true });
    return data.deleted;
  } catch (error) {
    throw new Error((error as { message?: string }).message || 'Unable to remove the roster.');
  }
}

/**
 * Configure which sections may vote in this election. An empty list means every
 * active, eligible roster student may vote (the default). Sent to the trusted
 * setEligibleSections callable, which re-normalizes server-side, enforces the
 * lock/draft-or-open guard, and writes the audit entry.
 */
export async function setEligibleSections(
  sections: string[],
  actorUid: string,
  electionId = ELECTION_ID,
): Promise<void> {
  const call = httpsCallable<
    { electionId: string; sections: string[] },
    { ok: boolean; sections: string[] }
  >(getFirebaseFunctions(), 'setEligibleSections');
  try {
    await call({ electionId, sections });
  } catch (error) {
    throw new Error((error as { message?: string }).message || 'Unable to update eligible sections.');
  }
}
