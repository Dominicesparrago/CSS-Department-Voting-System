import { describe, expect, it } from 'vitest';
import type { Candidate, Position } from '../types';
import {
  isBallotComplete,
  requiredPositionsForVoter,
  selectedCandidatesByPosition,
  unansweredPositions,
} from './ballotState';

const positions: Position[] = [
  { id: 'year_rep_3', name: '3rd Year Rep', scope: 'year', yearLevel: 3, order: 18 },
  { id: 'president', name: 'President', scope: 'department', order: 1 },
  { id: 'year_rep_1', name: '1st Year Rep', scope: 'year', yearLevel: 1, order: 20 },
  { id: 'secretary', name: 'Secretary', scope: 'department', order: 4 },
];

describe('requiredPositionsForVoter', () => {
  it('keeps department races plus only the voter’s own year rep, in ballot order', () => {
    expect(requiredPositionsForVoter(positions, 3).map((p) => p.id)).toEqual([
      'president',
      'secretary',
      'year_rep_3',
    ]);
  });

  it('excludes all year reps for a year with no matching rep race', () => {
    expect(requiredPositionsForVoter(positions, 2).map((p) => p.id)).toEqual(['president', 'secretary']);
  });
});

describe('unansweredPositions / isBallotComplete', () => {
  const required = requiredPositionsForVoter(positions, 3);

  it('reports races without a selection', () => {
    const partial = { president: 'c1' };
    expect(unansweredPositions(required, partial).map((p) => p.id)).toEqual(['secretary', 'year_rep_3']);
    expect(isBallotComplete(required, partial)).toBe(false);
  });

  it('is complete only when every race has a selection', () => {
    const full = { president: 'c1', secretary: 'c2', year_rep_3: 'c3' };
    expect(unansweredPositions(required, full)).toEqual([]);
    expect(isBallotComplete(required, full)).toBe(true);
  });

  it('an empty ballot is never complete', () => {
    expect(isBallotComplete([], {})).toBe(false);
  });
});

describe('selectedCandidatesByPosition', () => {
  it('pairs each race with the selected candidate (or undefined)', () => {
    const required = requiredPositionsForVoter(positions, 3);
    const candidates: Record<string, Candidate[]> = {
      president: [
        { id: 'c1', electionId: 'e', positionId: 'president', name: 'A', section: '', yearLevel: 3, platform: '', order: 1, active: true },
      ],
    };
    const review = selectedCandidatesByPosition(required, candidates, { president: 'c1' });
    expect(review).toHaveLength(3);
    expect(review[0].candidate?.id).toBe('c1');
    expect(review[1].candidate).toBeUndefined();
  });
});
