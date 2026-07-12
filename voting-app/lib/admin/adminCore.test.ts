import { describe, expect, it } from 'vitest';
import type { Candidate, Position, Vote, Voter } from '../types';
import {
  aggregateVotes,
  buildTallies,
  byId,
  cumulativeTurnout,
  rankedCandidatesForPosition,
  votersToCsv,
  votesToCsv,
} from './adminCore';

const E = 'css_department_election_2026';

function ts(ms: number) {
  return { toMillis: () => ms, toDate: () => new Date(ms) } as unknown as Vote['createdAt'];
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

function vote(overrides: Partial<Vote>): Vote {
  return {
    id: `${E}__v1__president`,
    electionId: E,
    uid: 'v1',
    positionId: 'president',
    candidateId: 'c1',
    yearLevel: 3,
    createdAt: ts(1000),
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

describe('aggregateVotes', () => {
  const candidates = [candidate({ id: 'c1' }), candidate({ id: 'c2', name: 'Candidate Two', order: 2 })];
  const voters = [
    voter({ id: 'v1', uid: 'v1', yearLevel: 3 }),
    voter({ id: 'v2', uid: 'v2', yearLevel: 2 }),
    voter({ id: 'v3', uid: 'v3', yearLevel: 2, eligible: false }),
  ];
  const votes = [
    vote({ id: '1', uid: 'v1', candidateId: 'c1' }),
    vote({ id: '2', uid: 'v1', candidateId: 'c2', positionId: 'year_rep_3' }),
    vote({ id: '3', uid: 'v2', candidateId: 'c1', yearLevel: 2 }),
  ];
  const agg = aggregateVotes({ votes, candidates, positions, voters });

  it('counts votes per candidate and per position', () => {
    expect(agg.perCandidate).toEqual({ c1: 2, c2: 1 });
    expect(agg.perPosition).toEqual({ president: 2, year_rep_3: 1 });
    expect(agg.byPositionCandidate.president).toEqual({ c1: 2 });
  });

  it('turnout counts unique voters, bucketed by their first ballot year', () => {
    expect(agg.turnout.total).toBe(2); // v1 voted twice but counts once
    expect(agg.turnout.byYear).toEqual({ '1': 0, '2': 1, '3': 1, '4': 0 });
  });

  it('eligible counts exclude ineligible voters', () => {
    expect(agg.eligible.total).toBe(2);
    expect(agg.eligible.byYear).toEqual({ '1': 0, '2': 1, '3': 1, '4': 0 });
  });
});

describe('cumulativeTurnout', () => {
  it('adds one point per unique voter, in time order, even from unsorted input', () => {
    const votes = [
      vote({ id: 'late', uid: 'v2', createdAt: ts(3000) }),
      vote({ id: 'early', uid: 'v1', createdAt: ts(1000) }),
      vote({ id: 'same-voter', uid: 'v1', createdAt: ts(2000), positionId: 'year_rep_3' }),
    ];
    expect(cumulativeTurnout(votes)).toEqual([
      { t: 1000, count: 1 },
      { t: 3000, count: 2 },
    ]);
  });

  it('returns an empty series for no votes', () => {
    expect(cumulativeTurnout([])).toEqual([]);
  });
});

describe('rankedCandidatesForPosition', () => {
  it('ranks by votes desc, then ballot order, then name', () => {
    const candidates = [
      candidate({ id: 'zero-b', name: 'Bravo', order: 3 }),
      candidate({ id: 'top', name: 'Top', order: 2 }),
      candidate({ id: 'zero-a', name: 'Alpha', order: 3 }),
    ];
    const agg = aggregateVotes({
      votes: [vote({ id: '1', candidateId: 'top' })],
      candidates,
      positions,
      voters: [voter({})],
    });
    const ranked = rankedCandidatesForPosition(candidates, agg, 'president');
    expect(ranked.map((c) => c.id)).toEqual(['top', 'zero-a', 'zero-b']);
    expect(ranked[0].votes).toBe(1);
  });
});

describe('buildTallies', () => {
  it('only counts votes belonging to the election', () => {
    const votes = [
      vote({ id: '1', uid: 'v1' }),
      vote({ id: '2', uid: 'v9', electionId: 'other_election' }),
    ];
    const tallies = buildTallies(E, votes);
    expect(tallies.perCandidate).toEqual({ c1: 1 });
    expect(tallies.turnout.total).toBe(1);
    expect(tallies.turnout.byYear['3']).toBe(1);
  });
});

describe('CSV export', () => {
  it('votesToCsv resolves names and quotes every cell', () => {
    const csv = votesToCsv({
      votes: [vote({ id: '1' })],
      candidates: [candidate({ id: 'c1', name: 'Says "Hi", loudly' })],
      positions,
    });
    const [header, row] = csv.split('\n');
    expect(header).toContain('"candidate"');
    expect(row).toContain('"Says ""Hi"", loudly"'); // embedded quotes doubled
    expect(row).toContain('"President"');
  });

  it('votersToCsv reports voted status against the election id', () => {
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
