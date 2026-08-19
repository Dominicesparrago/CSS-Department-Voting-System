'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const {
  toSerializable,
  fromSerializable,
  buildBackupPayload,
  serializeBackup,
  checksumOf,
  deserializeBackup,
  validateBackupPayload,
} = require('./backupLogic');

const E = 'css_department_election_2026';

test('timestamps round-trip through the portable form', () => {
  const ts = new Timestamp(1700000000, 123456789);
  const encoded = toSerializable(ts);
  assert.deepEqual(encoded, { _seconds: 1700000000, _nanoseconds: 123456789 });
  const restored = fromSerializable(encoded);
  assert.ok(restored instanceof Timestamp);
  assert.equal(restored.seconds, 1700000000);
  assert.equal(restored.nanoseconds, 123456789);
});

test('nested timestamps and arrays round-trip', () => {
  const input = {
    a: [new Timestamp(1, 2), { b: new Timestamp(3, 4) }],
    c: 'x',
    n: null,
  };
  const round = fromSerializable(toSerializable(input));
  assert.ok(round.a[0] instanceof Timestamp);
  assert.ok(round.a[1].b instanceof Timestamp);
  assert.equal(round.c, 'x');
  assert.equal(round.n, null);
});

test('buildBackupPayload keeps election scope and counts', () => {
  const payload = buildBackupPayload({
    electionId: E,
    type: 'pre-reset',
    candidates: [{ id: 'c1', electionId: E }],
    ballots: [{ id: 'b1', electionId: E }],
    tally: { perCandidate: { c1: 2 } },
    participation: [{ uid: 'u1', hasVoted: true }],
    createdAt: new Timestamp(5, 6),
  });
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.electionId, E);
  assert.equal(payload.type, 'pre-reset');
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.ballots.length, 1);
  assert.equal(payload.participation.length, 1);
  assert.deepEqual(payload.createdAt, { _seconds: 5, _nanoseconds: 6 });
});

test('serialize/checksum/deserialize round-trips exactly', () => {
  const payload = buildBackupPayload({
    electionId: E,
    type: 'manual',
    candidates: [],
    ballots: [],
    tally: null,
    participation: [],
    createdAt: null,
  });
  const text = serializeBackup(payload);
  const checksum = checksumOf(text);
  assert.equal(checksum.length, 64);
  const parsed = deserializeBackup(text);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.electionId, E);
  assert.deepEqual(parsed, payload);
});

test('checksum changes when content changes', () => {
  const a = checksumOf(serializeBackup(buildBackupPayload({ electionId: E, type: 'manual', candidates: [], ballots: [], tally: null, participation: [], createdAt: null })));
  const b = checksumOf(serializeBackup(buildBackupPayload({ electionId: E, type: 'manual', candidates: [{ id: 'x' }], ballots: [], tally: null, participation: [], createdAt: null })));
  assert.notEqual(a, b);
});

test('validateBackupPayload accepts a well-formed backup', () => {
  const payload = buildBackupPayload({ electionId: E, type: 'manual', candidates: [], ballots: [], tally: null, participation: [], createdAt: null });
  assert.deepEqual(validateBackupPayload(payload), { ok: true });
});

test('validateBackupPayload rejects malformed backups', () => {
  assert.equal(validateBackupPayload(null).ok, false);
  assert.equal(validateBackupPayload({ schemaVersion: 999, electionId: E, candidates: [], ballots: [], participation: [] }).ok, false);
  assert.equal(validateBackupPayload({ schemaVersion: 1, electionId: '', candidates: [], ballots: [], participation: [] }).ok, false);
  assert.equal(validateBackupPayload({ schemaVersion: 1, electionId: E, candidates: [], participation: [] }).ok, false);
});
