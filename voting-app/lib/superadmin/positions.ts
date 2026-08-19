import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase/init';

/**
 * Position management (superadmin). Runs through trusted callables so the
 * lock/finalize guard and position-name uniqueness are enforced server-side,
 * and every change is audited.
 */

export interface SavePositionInput {
  id?: string;
  name: string;
  maxSelections: number;
  order?: number;
  active?: boolean;
  /** 'year' positions also require a yearLevel. Defaults to 'department'. */
  scope?: 'department' | 'year';
  yearLevel?: number;
  electionId?: string;
}

export function savePosition(input: SavePositionInput): Promise<{ ok: boolean; id: string }> {
  const call = httpsCallable<
    SavePositionInput,
    { ok: boolean; id: string }
  >(getFirebaseFunctions(), 'savePosition');
  return call(input).then(({ data }) => data);
}

/** Delete a position. Refuses while candidates/ballots still reference it. */
export function deletePosition(params: { id: string; electionId?: string }): Promise<{ ok: boolean }> {
  const call = httpsCallable<{ id: string; electionId?: string }, { ok: boolean }>(
    getFirebaseFunctions(),
    'deletePosition',
  );
  return call(params).then(({ data }) => data);
}
