import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';
import { ELECTION_ID } from '../constants';

/**
 * Roster student edits (admin). Runs through a trusted callable so the
 * lock/finalize guard is enforced server-side and each edit is audited.
 * Participation locks are never modified here.
 */

export interface RosterStudentUpdate {
  id: string;
  fullName?: string;
  section?: string;
  yearLevel?: number;
  eligible?: boolean;
  status?: 'active' | 'inactive';
  electionId?: string;
}

export function updateRosterStudent(input: RosterStudentUpdate): Promise<{ ok: boolean; fields: string[] }> {
  const call = httpsCallable<
    { id: string; fullName?: string; section?: string; yearLevel?: number; eligible?: boolean; status?: string; electionId?: string },
    { ok: boolean; fields: string[] }
  >(getFirebaseFunctions(), 'updateRosterStudent');
  return call({
    id: input.id,
    fullName: input.fullName,
    section: input.section,
    yearLevel: input.yearLevel,
    eligible: input.eligible,
    status: input.status,
    electionId: input.electionId ?? ELECTION_ID,
  }).then(({ data }) => data);
}
