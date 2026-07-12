import { describe, expect, it } from 'vitest';
import type { Candidate, Position } from '../types';
import { candidatesForPosition, positionGroup } from './candidates';

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'c1',
    electionId: 'e1',
    positionId: 'president',
    name: 'Candidate',
    section: 'BSCS-3A',
    yearLevel: 3,
    platform: 'p',
    order: 1,
    active: true,
    ...overrides,
  };
}

function position(overrides: Partial<Position>): Position {
  return { id: 'president', name: 'President', scope: 'department', order: 1, ...overrides };
}

describe('candidatesForPosition', () => {
  it('filters to the position and sorts by order then name', () => {
    const list = [
      candidate({ id: 'b', order: 2, name: 'Beta' }),
      candidate({ id: 'x', positionId: 'other' }),
      candidate({ id: 'a2', order: 1, name: 'Zeta' }),
      candidate({ id: 'a1', order: 1, name: 'Alpha' }),
    ];
    expect(candidatesForPosition(list, 'president').map((c) => c.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('treats a missing order as 0', () => {
    const list = [
      candidate({ id: 'ordered', order: 1 }),
      candidate({ id: 'unordered', order: undefined as unknown as number }),
    ];
    expect(candidatesForPosition(list, 'president')[0].id).toBe('unordered');
  });

  it('returns empty for an unknown position', () => {
    expect(candidatesForPosition([candidate({})], 'nope')).toEqual([]);
  });
});

describe('positionGroup', () => {
  it('year-scoped positions are year reps regardless of order', () => {
    expect(positionGroup(position({ scope: 'year', order: 18 }))).toBe('year');
    expect(positionGroup(position({ scope: 'year', order: 1 }))).toBe('year');
  });

  it('department positions split at order 7 (executive vs committee)', () => {
    expect(positionGroup(position({ order: 1 }))).toBe('exec');
    expect(positionGroup(position({ order: 7 }))).toBe('exec');
    expect(positionGroup(position({ order: 8 }))).toBe('cmte');
  });
});
