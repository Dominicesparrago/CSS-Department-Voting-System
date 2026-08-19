'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runIntegrityChecks, buildReport, repairsFromChecks } = require('./doctorLogic');

const E = 'css_department_election_2026';

function doc(id, data) {
  return { id, data };
}

function emptyInputs() {
  return { voters: [], students: [], studentIndex: [], emailIndex: [], candidates: [], ballots: [], positions: [], elections: [], tallies: [] };
}

test('healthy database reports healthy with all ok checks', () => {
  const checks = runIntegrityChecks(emptyInputs());
  const report = buildReport(checks);
  assert.equal(report.status, 'healthy');
  assert.ok(checks.every((c) => c.status === 'ok'));
});

test('duplicate voter student numbers are flagged', () => {
  const inputs = emptyInputs();
  inputs.voters = [doc('v1', { studentNo: '20260001' }), doc('v2', { studentNo: '20260001' })];
  const checks = runIntegrityChecks(inputs);
  const dup = checks.find((c) => c.code === 'duplicate_voter_student_no');
  assert.equal(dup.status, 'error');
  assert.equal(dup.ids.length, 2);
});

test('orphaned index records are flagged as warnings', () => {
  const inputs = emptyInputs();
  inputs.voters = [doc('v1', { studentNo: '20260001' })];
  inputs.studentIndex = [doc('20260001', { uid: 'v1' }), doc('20260002', { uid: 'ghost' })];
  const checks = runIntegrityChecks(inputs);
  const orphan = checks.find((c) => c.code === 'orphan_student_index');
  assert.equal(orphan.status, 'warn');
  assert.deepEqual(orphan.ids, ['20260002']);
});

test('candidates with a missing election or position are flagged', () => {
  const inputs = emptyInputs();
  inputs.elections = [doc(E, { status: 'open' })];
  inputs.positions = [doc('president', { name: 'President', order: 1 })];
  inputs.candidates = [
    doc('c1', { electionId: E, positionId: 'president', name: 'A' }),
    doc('c2', { electionId: 'other', positionId: 'president', name: 'B' }),
    doc('c3', { electionId: E, positionId: 'ghost', name: 'C' }),
  ];
  const checks = runIntegrityChecks(inputs);
  assert.equal(checks.find((c) => c.code === 'candidate_missing_election').ids.includes('c2'), true);
  assert.equal(checks.find((c) => c.code === 'candidate_missing_position').ids.includes('c3'), true);
  assert.equal(checks.find((c) => c.code === 'candidate_missing_election').status, 'error');
});

test('inconsistent tallies are flagged', () => {
  const inputs = emptyInputs();
  inputs.elections = [doc(E, { status: 'published' })];
  inputs.positions = [doc('president', { name: 'President', order: 1 })];
  inputs.candidates = [doc('c1', { electionId: E, positionId: 'president', name: 'A' })];
  inputs.ballots = [
    doc('b1', { electionId: E, positionId: 'president', candidateId: 'c1' }),
    doc('b2', { electionId: E, positionId: 'president', candidateId: 'c1' }),
  ];
  inputs.tallies = [doc(E, { perCandidate: { c1: 1 }, perPosition: { president: 1 } })];
  const checks = runIntegrityChecks(inputs);
  assert.equal(checks.find((c) => c.code === 'tally_inconsistent').status, 'error');
  assert.deepEqual(checks.find((c) => c.code === 'tally_inconsistent').ids, [E]);
});

test('published election without a tally is flagged', () => {
  const inputs = emptyInputs();
  inputs.elections = [doc(E, { status: 'published' })];
  const checks = runIntegrityChecks(inputs);
  assert.equal(checks.find((c) => c.code === 'election_missing_tally').status, 'error');
  assert.deepEqual(checks.find((c) => c.code === 'election_missing_tally').ids, [E]);
});

test('repairsFromChecks produces only safe, id-bearing actions', () => {
  const inputs = emptyInputs();
  inputs.elections = [doc(E, { status: 'open' })];
  inputs.voters = [doc('v1', { studentNo: '20260001' })];
  inputs.studentIndex = [doc('20260002', { uid: 'ghost' })];
  inputs.positions = [doc('president', { name: 'President', order: 1 })];
  inputs.candidates = [doc('c1', { electionId: 'ghost', positionId: 'president', name: 'A' })];
  inputs.ballots = [doc('b1', { electionId: E, positionId: 'president', candidateId: 'c1' })];
  inputs.tallies = [doc(E, { perCandidate: { c1: 0 }, perPosition: { president: 0 } })];
  const checks = runIntegrityChecks(inputs);
  const actions = repairsFromChecks(checks);
  const codes = actions.map((a) => a.code);
  assert.ok(codes.includes('delete_orphan_student_index'));
  assert.ok(codes.includes('set_candidate_election'));
  assert.ok(codes.includes('recompute_tally'));
  assert.ok(actions.every((a) => a.ids.length > 0 && a.affected === a.ids.length));
});
