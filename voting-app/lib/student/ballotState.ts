import type { Position, Candidate, Selections } from '../types';

export function requiredPositionsForVoter(positions: Position[], yearLevel: number): Position[] {
  return positions
    .filter((p) => p.scope === 'department' || (p.scope === 'year' && p.yearLevel === yearLevel))
    .sort((a, b) => a.order - b.order);
}

export function unansweredPositions(required: Position[], selections: Selections): Position[] {
  return required.filter((p) => !selections[p.id]);
}

export function isBallotComplete(required: Position[], selections: Selections): boolean {
  return required.length > 0 && unansweredPositions(required, selections).length === 0;
}

export function selectedCandidatesByPosition(
  required: Position[],
  candidatesByPosition: Record<string, Candidate[]>,
  selections: Selections,
) {
  return required.map((position) => ({
    position,
    candidate: (candidatesByPosition[position.id] ?? []).find((c) => c.id === selections[position.id]),
  }));
}
