import { describe, expect, it } from 'vitest';
import type { Timestamp } from 'firebase/firestore';
import type { Candidate, Position, Voter } from '../types';
import {
  buildAggregate,
  byId,
  cumulativeTurnoutFromVoters,
  rankedCandidatesForPosition,
  resultsToCsv,
  votersToCsv,
} from './adminCore';

const E = 'css_department_election_2026';

function ts(ms: number): Timestamp {
  return { toMillis: () => ms, toDate: () => new Date(ms) } as unknown as Timestamp;
}

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'c1',
    electionId: E,
    positionId: 'president',
    name: 'Candidate One',
    section: 'BSCS-3A',
    yearLevel: 3,
    platform: 'p',
    order: 1,
    active: true,
    ...overrides,
  };
}

function voter(overrides: Partial<Voter>): Voter {
  return {
    id: 'v1',
    uid: 'v1',
    fullName: 'Voter One',
    email: 'voter.one.scc@gmail.com',
    yearLevel: 3,
    section: 'BSCS-3A',
    eligible: true,
    ...overrides,
  };
}

const positions: Position[] = [
  { id: 'president', name: 'President', scope: 'department', order: 1 },
  { id: 'year_rep_3', name: '3rd Year Rep', scope: 'year', yearLevel: 3, order: 18 },
];

describe('byId', () => {
  it('indexes records by their id', () => {
    const map = byId([candidate({ id: 'a' }), candidate({ id: 'b' })]);
    expect(Object.keys(map)).toEqual(['a', 'b']);
    expect(map.a.id).toBe('a');
  });
});

describe('buildAggregate', () => {
  const candidates = [candidate({ id: 'c1' }), candidate({ id: 'c2', name: 'Candidate Two', order: 2 })];
  const voters = [
    voter({ id: 'v1', uid: 'v1', yearLevel: 3, hasVoted: { [E]: true } }),
    voter({ id: 'v2', uid: 'v2', yearLevel: 2, hasVoted: { [E]: true } }),
    voter({ id: 'v3', uid: 'v3', yearLevel: 2 }), // eligible, not voted
    voter({ id: 'v4', uid: 'v4', yearLevel: 2, eligible: false }),
  ];
  // per-candidate / per-position come from the trusted getResults function
  const results = { perCandidate: { c1: 2, c2: 1 }, perPosition: { president: 2, year_rep_3: 1 } };
  const agg = buildAggregate({ results, candidates, positions, voters, electionId: E });

  it('passes through server-computed per-candidate/per-position counts', () => {
    expect(agg.perCandidate).toEqual({ c1: 2, c2: 1 });
    expect(agg.perPosition).toEqual({ president: 2, year_rep_3: 1 });
  });

  it('derives turnout from the participation lock, not from ballots', () => {
    expect(agg.turnout.total).toBe(2);
    expect(agg.turnout.byYear).toEqual({ '1': 0, '2': 1, '3': 1, '4': 0 });
  });

  it('counts eligible voters excluding ineligible ones', () => {
    expect(agg.eligible.total).toBe(3);
    expect(agg.eligible.byYear).toEqual({ '1': 0, '2': 2, '3': 1, '4': 0 });
  });
});

describe('cumulativeTurnoutFromVoters', () => {
  it('builds one point per voter, ordered by votedAt', () => {
    const voters = [
      voter({ id: 'v2', uid: 'v2', hasVoted: { [E]: true }, votedAt: { [E]: ts(3000) } }),
      voter({ id: 'v1', uid: 'v1', hasVoted: { [E]: true }, votedAt: { [E]: ts(1000) } }),
      voter({ id: 'v3', uid: 'v3' }), // not voted → excluded
    ];
    expect(cumulativeTurnoutFromVoters(voters, E)).toEqual([
      { t: 1000, count: 1 },
      { t: 3000, count: 2 },
    ]);
  });

  it('ignores voted rows with no readable votedAt timestamp', () => {
    const voters = [voter({ id: 'v1', uid: 'v1', hasVoted: { [E]: true } })];
    expect(cumulativeTurnoutFromVoters(voters, E)).toEqual([]);
  });
});

describe('rankedCandidatesForPosition', () => {
  it('ranks by votes desc, then ballot order, then name', () => {
    const candidates = [
      candidate({ id: 'zero-b', name: 'Bravo', order: 3 }),
      candidate({ id: 'top', name: 'Top', order: 2 }),
      candidate({ id: 'zero-a', name: 'Alpha', order: 3 }),
    ];
    const agg = buildAggregate({
      results: { perCandidate: { top: 5 }, perPosition: { president: 5 } },
      candidates,
      positions,
      voters: [],
      electionId: E,
    });
    const ranked = rankedCandidatesForPosition(candidates, agg, 'president');
    expect(ranked.map((c) => c.id)).toEqual(['top', 'zero-a', 'zero-b']);
    expect(ranked[0].votes).toBe(5);
  });
});

describe('resultsToCsv', () => {
  it('exports candidate counts (no per-ballot rows) and quotes every cell', () => {
    const csv = resultsToCsv({
      results: { perCandidate: { c1: 3 }, perPosition: { president: 3 } },
      candidates: [candidate({ id: 'c1', name: 'Says "Hi"' })],
      positions,
    });
    const [header, row] = csv.split('\n');
    expect(header).toContain('"votes"');
    expect(row).toContain('"Says ""Hi"""');
    expect(row).toContain('"3"');
  });
});

describe('votersToCsv', () => {
  it('reports voted status against the election id', () => {
    const csv = votersToCsv(
      [
        voter({ id: 'v1', fullName: 'Has Voted', hasVoted: { [E]: true } }),
        voter({ id: 'v2', uid: 'v2', fullName: 'Not Yet' }),
      ],
      E,
    );
    const rows = csv.split('\n');
    expect(rows[1]).toContain('"voted"');
    expect(rows[2]).toContain('"not yet"');
  });
});
