'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyResults } = require('./verifyLogic');

const E = 'css_department_election_2026';

const positions = [
  { id: 'president', name: 'President', order: 1, scope: 'department' },
  { id: 'secretary', name: 'Secretary', order: 4, scope: 'department' },
];

const candidates = [
  { id: 'c1', electionId: E, positionId: 'president', name: 'A' },
  { id: 'c2', electionId: E, positionId: 'secretary', name: 'B' },
];

function ballot(positionId, candidateId) {
  return { electionId: E, positionId, candidateId, yearLevel: 3 };
}

test('a closed election with valid refs and a matching tally verifies', () => {
  const ballots = [ballot('president', 'c1'), ballot('secretary', 'c2')];
  const tally = { perCandidate: { c1: 1, c2: 1 }, perPosition: { president: 1, secretary: 1 } };
  const result = verifyResults({ election: { status: 'closed', positions: ['president', 'secretary'] }, positions, candidates, ballots, tally });
  assert.equal(result.ok, true);
  assert.ok(result.checks.every((c) => c.status === 'ok'));
});

test('an open election fails verification', () => {
  const result = verifyResults({ election: { status: 'open' }, positions, candidates, ballots: [], tally: null });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.label === 'Election completed').status, 'error');
});

test('a tally mismatch fails verification', () => {
  const ballots = [ballot('president', 'c1')];
  const tally = { perCandidate: { c1: 99 }, perPosition: { president: 99 } };
  const result = verifyResults({ election: { status: 'closed', positions: ['president', 'secretary'] }, positions, candidates, ballots, tally });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.label === 'Vote totals consistent').status, 'error');
});

test('a missing tally fails verification', () => {
  const result = verifyResults({ election: { status: 'closed', positions: [] }, positions, candidates, ballots: [], tally: null });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.label === 'Vote totals consistent').status, 'error');
});
