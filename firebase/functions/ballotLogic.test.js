'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredPositionsForVoter, validateBallot } = require('./ballotLogic');

const E = 'css_department_election_2026';

const positions = [
  { id: 'president', scope: 'department', order: 1 },
  { id: 'secretary', scope: 'department', order: 4 },
  { id: 'year_rep_2', scope: 'year', yearLevel: 2, order: 19 },
  { id: 'year_rep_3', scope: 'year', yearLevel: 3, order: 18 },
];

function candidate(overrides) {
  return { electionId: E, positionId: 'president', active: true, ...overrides };
}

test('requiredPositionsForVoter keeps department races + own year rep in order', () => {
  const ids = requiredPositionsForVoter(positions, 3).map((p) => p.id);
  assert.deepEqual(ids, ['president', 'secretary', 'year_rep_3']);
});

test('validateBallot accepts a complete, correct ballot', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'president' }),
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', secretary: 's1', year_rep_3: 'y3' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, true);
  assert.equal(res.ballots.length, 3);
  assert.deepEqual(res.ballots[0], { electionId: E, positionId: 'president', candidateId: 'p1', yearLevel: 3 });
});

test('validateBallot accepts an empty ballot', () => {
  const candidatesById = { p1: candidate({ positionId: 'president' }) };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: {},
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, true);
  assert.equal(res.ballots.length, 0);
});

test('validateBallot accepts a partial ballot', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'president' }),
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', year_rep_3: 'y3' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, true);
  assert.equal(res.ballots.length, 2);
});

test('validateBallot rejects a selection outside the voter’s ballot (wrong year rep)', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'president' }),
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
    y2: candidate({ positionId: 'year_rep_2' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', secretary: 's1', year_rep_3: 'y3', year_rep_2: 'y2' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, false);
});

test('validateBallot rejects an inactive candidate', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'president', active: false }),
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', secretary: 's1', year_rep_3: 'y3' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, false);
});

test('validateBallot rejects a candidate whose position does not match its race', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'secretary' }), // wrong: assigned to president slot
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', secretary: 's1', year_rep_3: 'y3' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, false);
});

test('validateBallot rejects a candidate from another election', () => {
  const candidatesById = {
    p1: candidate({ positionId: 'president', electionId: 'other' }),
    s1: candidate({ positionId: 'secretary' }),
    y3: candidate({ positionId: 'year_rep_3' }),
  };
  const res = validateBallot({
    positions,
    yearLevel: 3,
    selections: { president: 'p1', secretary: 's1', year_rep_3: 'y3' },
    candidatesById,
    electionId: E,
  });
  assert.equal(res.ok, false);
});
