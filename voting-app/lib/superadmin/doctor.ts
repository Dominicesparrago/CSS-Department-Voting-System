import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';
import type { DoctorCheck, RepairAction } from '../types';

/**
 * Database Doctor (superadmin). The scan is read-only and returns candidate
 * fixes; each repair is applied only after explicit confirmation and is audited
 * server-side.
 */

export interface DoctorReportResult {
  status: 'healthy' | 'issues';
  checks: DoctorCheck[];
  repairs: RepairAction[];
  scannedAt: string;
}

/** Run the read-only integrity scan. */
export function runDatabaseDoctor(): Promise<DoctorReportResult> {
  const call = httpsCallable<Record<string, never>, DoctorReportResult>(
    getFirebaseFunctions(),
    'databaseDoctor',
  );
  return call({}).then(({ data }) => data);
}

/** Apply a single confirmed repair by code + ids surfaced by the scan. */
export function applyDatabaseRepair(params: {
  code: string;
  ids: string[];
  electionId?: string;
}): Promise<{ ok: boolean; code: string; affected: number }> {
  const call = httpsCallable<
    { code: string; ids: string[]; electionId?: string },
    { ok: boolean; code: string; affected: number }
  >(getFirebaseFunctions(), 'databaseRepair');
  return call({
    code: params.code,
    ids: params.ids,
    electionId: params.electionId,
  }).then(({ data }) => data);
}
