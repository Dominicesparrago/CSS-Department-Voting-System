import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/init';
import { snapshotRecords } from '../firebase/firestore';
import type { BackupRecord, ResetEstimate, ResetScope } from '../types';

/**
 * Reset Center + Backup/Restore (superadmin). Every destructive operation runs
 * through a trusted Cloud Function that re-checks the superadmin claim, requires
 * a fresh backup before any reset, and writes a server-side audit entry. Ballots
 * are never readable by the client, so affected counts come from the server.
 */

export interface ResetDeletedCounts {
  candidates: number;
  ballots: number;
  tallies: number;
  votersLocked: number;
}

export interface ResetResult {
  ok: boolean;
  scope: ResetScope;
  deleted: ResetDeletedCounts;
  preserved: string[];
}

/** Affected-record counts for a proposed reset. */
export function estimateReset(electionId: string): Promise<ResetEstimate> {
  const call = httpsCallable<{ electionId: string }, ResetEstimate>(
    getFirebaseFunctions(),
    'estimateReset',
  );
  return call({ electionId }).then(({ data }) => data);
}

/** Create a backup of the election's candidate/ballot/tally/lock data. */
export function createBackup(params: {
  electionId?: string;
  type?: 'manual' | 'pre-reset';
}): Promise<{ ok: boolean; backupId: string; storagePath: string; sizeBytes: number; checksum: string }> {
  const call = httpsCallable<
    { electionId?: string; type?: 'manual' | 'pre-reset' },
    { ok: boolean; backupId: string; storagePath: string; sizeBytes: number; checksum: string }
  >(getFirebaseFunctions(), 'createBackup');
  return call({ electionId: params.electionId, type: params.type }).then(({ data }) => data);
}

/** Restore an election backup (checksum-verified server-side). */
export function restoreBackup(params: {
  backupId: string;
  overwrite?: boolean;
}): Promise<{ ok: boolean; electionId: string; counts: Record<string, number> }> {
  const call = httpsCallable<
    { backupId: string; overwrite?: boolean },
    { ok: boolean; electionId: string; counts: Record<string, number> }
  >(getFirebaseFunctions(), 'restoreBackup');
  return call({ backupId: params.backupId, overwrite: params.overwrite }).then(({ data }) => data);
}

/** Delete a backup record and its storage payload. */
export function deleteBackup(backupId: string): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ backupId: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'deleteBackup',
  );
  return call({ backupId }).then(({ data }) => data);
}

/**
 * Election-scoped destructive reset. Requires `backupId` (a fresh backup must
 * exist before anything is deleted) and, for a lock-only reset on an election
 * that already has ballots, `force`.
 */
export function resetElectionData(params: {
  electionId: string;
  scope: ResetScope;
  backupId: string;
  force?: boolean;
}): Promise<ResetResult> {
  const call = httpsCallable<
    { electionId: string; scope: ResetScope; backupId: string; force?: boolean },
    ResetResult
  >(getFirebaseFunctions(), 'resetElectionData');
  return call({
    electionId: params.electionId,
    scope: params.scope,
    backupId: params.backupId,
    force: params.force,
  }).then(({ data }) => data);
}

export function watchBackups(
  onChange: (backups: BackupRecord[]) => void,
  onError: (e: Error) => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, 'backups'), orderBy('createdAt', 'desc')),
    (snapshot) => onChange(snapshotRecords<BackupRecord>(snapshot)),
    onError,
  );
}
