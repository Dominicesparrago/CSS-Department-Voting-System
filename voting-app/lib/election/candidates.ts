import type { Candidate, Position } from '../types';

/** Candidates for one position in ballot order (order, then name). */
export function candidatesForPosition(candidates: Candidate[], positionId: string): Candidate[] {
  return candidates
    .filter((c) => c.positionId === positionId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

export type PositionGroup = 'exec' | 'cmte' | 'year';

/** Ballot grouping convention: positions 1–7 are executive, the rest committees, year-scoped are year reps. */
export function positionGroup(position: Position): PositionGroup {
  if (position.scope === 'year') return 'year';
  return (position.order ?? 0) <= 7 ? 'exec' : 'cmte';
}
